import Handlebars from "handlebars";
import { glob } from "glob";
import { readFile } from "node:fs/promises";
import path from "node:path";
import z from "zod";
import { Template } from "../models/template";

type HandlebarsAstNode = {
  type: string;
  [key: string]: unknown;
};

type HandlebarsPathExpression = {
  type: "PathExpression";
  parts: string[];
  original: string;
  data?: boolean;
  this?: boolean;
  depth?: number;
};

type HandlebarsHash = {
  pairs: { value: HandlebarsAstNode }[];
};

type HandlebarsUsage = {
  partials: Set<string>;
  helpers: Set<string>;
  settings: Set<string>;
};

type TraversalContext = {
  inScopedContext: number;
};

const BUILTIN_HELPERS = new Set([
  "if",
  "unless",
  "each",
  "with",
  "log",
  "lookup",
  "helperMissing",
  "blockHelperMissing",
  "*inline",
]);

const DEFAULT_HELPERS = new Set(["eq", "snakeCase"]);
const CONTEXT_CHANGING_HELPERS = new Set(["each", "with"]);

function isBinaryContent(buffer: Buffer): boolean {
  const length = Math.min(buffer.length, 512);
  let suspicious = 0;

  for (let i = 0; i < length; i++) {
    const byte = buffer[i]!;
    if (byte === 0) {
      return true;
    }

    if (byte < 7 || (byte > 13 && byte < 32) || byte === 127) {
      suspicious++;
      if (suspicious / length > 0.1) {
        return true;
      }
    }
  }

  return false;
}

function collectFromPathExpression(
  pathExpression: HandlebarsPathExpression,
  usage: HandlebarsUsage,
  context: TraversalContext,
  allowHelper: boolean,
): void {
  if (pathExpression.data || pathExpression.this) {
    return;
  }

  if (pathExpression.parts.length === 0) {
    return;
  }

  if (allowHelper) {
    usage.helpers.add(pathExpression.original);
    return;
  }

  if (context.inScopedContext > 0 && (pathExpression.depth ?? 0) === 0) {
    return;
  }

  usage.settings.add(pathExpression.parts.join("."));
}

function visitHash(
  hash: HandlebarsHash | undefined,
  usage: HandlebarsUsage,
  context: TraversalContext,
): void {
  if (!hash) {
    return;
  }

  for (const pair of hash.pairs) {
    visitNode(pair.value, usage, context);
  }
}

function visitNode(
  node: HandlebarsAstNode,
  usage: HandlebarsUsage,
  context: TraversalContext,
): void {
  switch (node.type) {
    case "Program": {
      const body = node.body as HandlebarsAstNode[] | undefined;
      if (body) {
        for (const bodyNode of body) {
          visitNode(bodyNode, usage, context);
        }
      }
      return;
    }
    case "MustacheStatement": {
      const params = (node.params as HandlebarsAstNode[]) ?? [];
      const hash = node.hash as HandlebarsHash | undefined;
      const isHelperCall =
        params.length > 0 || (hash?.pairs.length ?? 0) > 0;
      if ((node.path as HandlebarsAstNode)?.type === "PathExpression") {
        collectFromPathExpression(
          node.path as HandlebarsPathExpression,
          usage,
          context,
          isHelperCall,
        );
      }
      for (const param of params) {
        visitNode(param, usage, context);
      }
      visitHash(hash, usage, context);
      return;
    }
    case "BlockStatement": {
      const params = (node.params as HandlebarsAstNode[]) ?? [];
      const hash = node.hash as HandlebarsHash | undefined;
      if ((node.path as HandlebarsAstNode)?.type === "PathExpression") {
        collectFromPathExpression(
          node.path as HandlebarsPathExpression,
          usage,
          context,
          true,
        );
      }
      for (const param of params) {
        visitNode(param, usage, context);
      }
      visitHash(hash, usage, context);

      const isContextChanging =
        (node.path as HandlebarsAstNode)?.type === "PathExpression" &&
        CONTEXT_CHANGING_HELPERS.has(
          (node.path as HandlebarsPathExpression).original,
        );
      const nextContext = {
        inScopedContext: context.inScopedContext + (isContextChanging ? 1 : 0),
      };
      if (node.program) {
        visitNode(node.program as HandlebarsAstNode, usage, nextContext);
      }
      if (node.inverse) {
        visitNode(node.inverse as HandlebarsAstNode, usage, nextContext);
      }
      return;
    }
    case "PartialStatement": {
      const name = node.name as HandlebarsAstNode | undefined;
      const params = (node.params as HandlebarsAstNode[]) ?? [];
      const hash = node.hash as HandlebarsHash | undefined;
      if (name?.type === "PathExpression") {
        usage.partials.add((name as HandlebarsPathExpression).original);
      } else if (name?.type === "StringLiteral") {
        const literal = name as { value?: unknown };
        if (typeof literal.value === "string") {
          usage.partials.add(literal.value);
        }
      }
      for (const param of params) {
        visitNode(param, usage, context);
      }
      visitHash(hash, usage, context);
      return;
    }
    case "PartialBlockStatement": {
      const name = node.name as HandlebarsAstNode | undefined;
      const params = (node.params as HandlebarsAstNode[]) ?? [];
      const hash = node.hash as HandlebarsHash | undefined;
      if (name?.type === "PathExpression") {
        usage.partials.add((name as HandlebarsPathExpression).original);
      } else if (name?.type === "StringLiteral") {
        const literal = name as { value?: unknown };
        if (typeof literal.value === "string") {
          usage.partials.add(literal.value);
        }
      }
      for (const param of params) {
        visitNode(param, usage, context);
      }
      visitHash(hash, usage, context);
      if (node.program) {
        visitNode(node.program as HandlebarsAstNode, usage, context);
      }
      return;
    }
    case "SubExpression": {
      const params = (node.params as HandlebarsAstNode[]) ?? [];
      const hash = node.hash as HandlebarsHash | undefined;
      if ((node.path as HandlebarsAstNode)?.type === "PathExpression") {
        collectFromPathExpression(
          node.path as HandlebarsPathExpression,
          usage,
          context,
          true,
        );
      }
      for (const param of params) {
        visitNode(param, usage, context);
      }
      visitHash(hash, usage, context);
      return;
    }
    case "PathExpression": {
      collectFromPathExpression(
        node as HandlebarsPathExpression,
        usage,
        context,
        false,
      );
      return;
    }
    default:
      return;
  }
}

function collectHandlebarsUsageFromString(
  templateSource: string,
  usage: HandlebarsUsage,
): void {
  const ast = Handlebars.parse(templateSource) as unknown as HandlebarsAstNode;
  visitNode(ast, usage, { inScopedContext: 0 });
}

async function collectHandlebarsUsage(
  template: Template,
): Promise<HandlebarsUsage> {
  const usage: HandlebarsUsage = {
    partials: new Set(),
    helpers: new Set(),
    settings: new Set(),
  };

  const entries = await glob("**/*", {
    cwd: template.absoluteFilesDir,
    dot: true,
    nodir: true,
  });

  for (const entry of entries) {
    const fileBuffer = await readFile(
      path.join(template.absoluteFilesDir, entry),
    );
    const shouldTemplate = entry.endsWith(".hbs") || !isBinaryContent(fileBuffer);
    if (!shouldTemplate) {
      continue;
    }
    collectHandlebarsUsageFromString(fileBuffer.toString("utf-8"), usage);
  }

  const partials = await template.findAllPartials();
  if ("error" in partials) {
    throw new Error(partials.error);
  }

  for (const partialPath of Object.values(partials.data)) {
    const partialBuffer = await readFile(partialPath);
    collectHandlebarsUsageFromString(partialBuffer.toString("utf-8"), usage);
  }

  return usage;
}

type ZodSchema = z.ZodType;
type ZodSchemaDef = {
  type: string;
  innerType?: ZodSchema;
  shape?: Record<string, ZodSchema>;
  element?: ZodSchema;
  items?: ZodSchema[];
  options?: ZodSchema[];
  left?: ZodSchema;
  right?: ZodSchema;
  out?: ZodSchema;
  rest?: ZodSchema | null;
  valueType?: ZodSchema;
};

function unwrapSchema(schema: ZodSchema): ZodSchema {
  let current: ZodSchema = schema;
  while (true) {
    const def = current.def as ZodSchemaDef;
    switch (def.type) {
      case "optional":
      case "default":
      case "nullable":
      case "catch":
      case "prefault":
      case "readonly":
      case "nonoptional":
        if (!def.innerType) {
          return current;
        }
        current = def.innerType;
        continue;
      case "pipe":
        if (!def.out) {
          return current;
        }
        current = def.out;
        continue;
      default:
        return current;
    }
  }
}

function isNumericPart(part: string): boolean {
  return part !== "" && Number.isFinite(Number(part));
}

function hasSchemaPath(
  schema: ZodSchema,
  parts: string[],
): boolean {
  if (parts.length === 0) {
    return true;
  }

  const current = unwrapSchema(schema);
  const def = current.def as ZodSchemaDef;

  if (def.type === "object" && def.shape) {
    const [head, ...rest] = parts;
    if (!head) {
      return false;
    }
    const nextSchema = def.shape[head];
    if (!nextSchema) {
      return false;
    }
    return hasSchemaPath(nextSchema, rest);
  }

  if (def.type === "array" && def.element) {
    const [head, ...rest] = parts;
    const remaining = head && isNumericPart(head) ? rest : parts;
    return hasSchemaPath(def.element, remaining);
  }

  if (def.type === "tuple" && def.items) {
    const [head, ...rest] = parts;
    if (!head || !isNumericPart(head)) {
      return false;
    }
    const index = Number(head);
    const item = def.items[index];
    if (!item) {
      return false;
    }
    return hasSchemaPath(item, rest);
  }

  if (def.type === "record" && def.valueType) {
    const [, ...rest] = parts;
    if (rest.length === 0) {
      return true;
    }
    return hasSchemaPath(def.valueType, rest);
  }

  if (def.type === "union" && def.options) {
    return def.options.some((option) => hasSchemaPath(option, parts));
  }

  if (def.type === "intersection" && def.left && def.right) {
    return hasSchemaPath(def.left, parts) || hasSchemaPath(def.right, parts);
  }

  return false;
}

export async function checkMissingSettings(
  template: Template,
): Promise<{ missingSettings: string[]; missingHelpers: string[] }> {
  const usage = await collectHandlebarsUsage(template);
  const helpers = template.config.handlebarHelpers ?? {};

  const availableHelpers = new Set<string>([
    ...BUILTIN_HELPERS,
    ...DEFAULT_HELPERS,
    ...Object.keys(helpers),
  ]);

  const missingHelpers = Array.from(usage.helpers).filter(
    (helper) => !availableHelpers.has(helper),
  );

  const schema =
    template.config.templateFinalSettingsSchema ??
    template.config.templateSettingsSchema;
  const missingSettings = Array.from(usage.settings).filter((settingPath) => {
    const parts = settingPath.split(".").filter(Boolean);
    return !hasSchemaPath(schema as ZodSchema, parts);
  });

  return {
    missingSettings: missingSettings.sort(),
    missingHelpers: missingHelpers.sort(),
  };
}

export async function checkMissingPartials(
  template: Template,
): Promise<{ missingPartials: string[] }> {
  const usage = await collectHandlebarsUsage(template);
  const partials = await template.findAllPartials();

  if ("error" in partials) {
    throw new Error(partials.error);
  }

  const availablePartials = new Set(Object.keys(partials.data));
  const missingPartials = Array.from(usage.partials).filter(
    (partial) => !availablePartials.has(partial),
  );

  return { missingPartials: missingPartials.sort() };
}
