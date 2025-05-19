import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import ts from "typescript";

import * as templateTypesLibNS from "@timonteutelink/template-types-lib";
import * as handlebarsNS from "handlebars";
import * as yamlNS from "yaml";
import * as zodNS from "zod"; // full namespace object

import {
  getHash,
  retrieveFromCache,
  saveToCache,
} from "../services/cache-service";
import { getEsbuild } from "../utils/get-esbuild";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";

type TemplateConfigModule<
  TFullSettingsType extends TemplateSettingsType<
    TSettingsType,
    UserTemplateSettings
  >,
  TSettingsType extends zodNS.AnyZodObject,
> = templateTypesLibNS.TemplateConfigModule<TFullSettingsType, TSettingsType>;
type TemplateSettingsType<
  TSettingsSchema extends zodNS.AnyZodObject,
  TParentSettings extends UserTemplateSettings = {},
> = templateTypesLibNS.TemplateSettingsType<TSettingsSchema, TParentSettings>;

const { templateConfigSchema } = templateTypesLibNS;

const SANDBOX_LIBS: Record<string, unknown> = {
  "@timonteutelink/template-types-lib": templateTypesLibNS,
  zod: zodNS,
  handlebars: handlebarsNS,

  // utils
  yaml: yamlNS,
};

interface TemplateConfigFileInfo {
  configPath: string;
  refDir?: string;
}

export type TemplateConfigWithFileInfo = {
  templateConfig: TemplateConfigModule<
    TemplateSettingsType<zodNS.AnyZodObject>,
    zodNS.AnyZodObject
  >;
} & TemplateConfigFileInfo;

async function readTsConfig(): Promise<any> {
  return {
    "$schema": "https://json.schemastore.org/tsconfig",
    "compilerOptions": {
      "target": "ES2022",

      "module": "NodeNext",
      "moduleResolution": "NodeNext",

      "types": ["node"],

      "strict": true,
      // "skipLibCheck": true         // speeds up builds; safe for CLIs
    }
  }
}

// async function readTsConfig() {
//   const module = await import("@repo/typescript-config/base.json", {
//     with: { type: "json" },
//   });
//   const tsConfig = module.default;
//   if (!tsConfig) throw new Error("Failed to load tsconfig.json");
//   return tsConfig;
// }

async function typeCheckFile(filePath: string): Promise<void> {
  const basePath = process.cwd();
  const tsConfig = await readTsConfig();
  const { options, errors } = ts.convertCompilerOptionsFromJson(
    { ...tsConfig.compilerOptions, baseUrl: basePath },
    basePath,
  );

  if (errors.length) {
    const host: ts.FormatDiagnosticsHost = {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine,
    };
    throw new Error(
      `Error in tsconfig:\n${ts.formatDiagnosticsWithColorAndContext(errors, host)}`,
    );
  }

  const program = ts.createProgram([filePath], options);
  const diags = ts.getPreEmitDiagnostics(program);
  if (diags.length) {
    const host: ts.FormatDiagnosticsHost = {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine,
    };
    throw new Error(
      `TypeScript type checking failed:\n${ts.formatDiagnosticsWithColorAndContext(
        diags,
        host,
      )}`,
    );
  }
}

async function findTemplateConfigFilesInSubdirs(
  dir: string,
): Promise<TemplateConfigFileInfo[]> {
  const out: TemplateConfigFileInfo[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sub = path.join(dir, entry.name);
    out.push(...(await findTemplateConfigFiles(sub)));
  }
  return out;
}

async function findTemplateConfigFiles(
  dir: string,
): Promise<TemplateConfigFileInfo[]> {
  const results: TemplateConfigFileInfo[] = [];

  const candidate = path.join(dir, "templateConfig.ts");
  if ((await fs.stat(candidate).catch(() => null))?.isFile()) {
    results.push({ configPath: candidate });
  }

  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;

    /* templateRef.json indirection */
    const refJson = path.join(full, "templateRef.json");
    if ((await fs.stat(refJson).catch(() => null))?.isFile()) {
      try {
        const rel = Object.values(
          JSON.parse(await fs.readFile(refJson, "utf8")),
        )[0];
        if (typeof rel === "string") {
          const refDir = path.join(full, rel);
          const refCfg = path.join(refDir, "templateConfig.ts");
          if ((await fs.stat(refCfg).catch(() => null))?.isFile()) {
            results.push({ configPath: refCfg, refDir: full });
            results.push(...(await findTemplateConfigFilesInSubdirs(refDir)));
          } else {
            console.warn(`Referenced templateConfig.ts not found at ${refCfg}`);
          }
        }
      } catch (e) {
        console.warn(`Error parsing ${refJson}: ${(e as Error).message}`);
      }
    } else {
      results.push(...(await findTemplateConfigFiles(full)));
    }
  }
  return results;
}

// Very simple and minimal sandbox
async function evaluateBundledCode(
  code: string,
): Promise<Record<string, TemplateConfigWithFileInfo>> {
  const { Script, createContext } = await import(
    /* webpackIgnore: true */ "node:vm"
  );

  function safeRequire(id: string) {
    if (id in SANDBOX_LIBS) return SANDBOX_LIBS[id];

    const rootId = id.split("/", 1)[0]!;
    if (rootId in SANDBOX_LIBS) return SANDBOX_LIBS[rootId];
    throw new Error(`Blocked import: ${id}`);
  }

  const wrapped = `(function (exports, require, module, __filename, __dirname) { ${code}\n});`;

  const context = createContext({});

  const script = new Script(wrapped, { filename: "template-bundle.cjs" });
  const module = { exports: {} };
  const func = script.runInContext(context);

  func(module.exports, safeRequire, module, "", "");

  return (module.exports as any).configs;
}

export async function loadAllTemplateConfigs(
  rootDir: string,
): Promise<Record<string, TemplateConfigWithFileInfo>> {
  const files = await findTemplateConfigFiles(rootDir);
  if (files.length === 0) {
    throw new Error(`No templateConfig.ts files found under ${rootDir}`);
  }

  const concat = await Promise.all(
    files.map((f) => fs.readFile(f.configPath, "utf8")),
  );
  const hash = getHash(concat.join(""));

  const cached = await retrieveFromCache("template-config", hash, "cjs");
  if ("data" in cached && cached.data) {
    const code = await fs.readFile(cached.data.path, "utf8");
    return evaluateBundledCode(code);
  }

  const imports: string[] = [];
  const exports: string[] = [];
  files
    .sort((a, b) => a.configPath.localeCompare(b.configPath))
    .forEach((fi, i) => {
      const rel = path.relative(rootDir, fi.configPath).replace(/\\/g, "/");
      const alias = `cfg${i}`;
      imports.push(`import ${alias} from "./${rel.slice(0, -3)}";`);
      let entry = `"${rel}": { templateConfig: ${alias}, configPath: "${rel}"`;
      if (fi.refDir) {
        const refRel = path.relative(rootDir, fi.refDir).replace(/\\/g, "/");
        entry += `, refDir: "${refRel}"`;
      }
      exports.push(entry + "}");
    });
  // add type info for full type checks. Probably something like Record<string, TemplateConfigModule<any>>
  const indexTs = `${imports.join("\n")}\nexport const configs = {${exports.join(",")}};`;

  const tmp = path.join(rootDir, `.__temp_index_${randomUUID()}.ts`);
  await fs.writeFile(tmp, indexTs, "utf8");
  try {
    await typeCheckFile(tmp);
  } finally {
    await fs.unlink(tmp);
  }

  const esbuild = await getEsbuild();
  const { outputFiles } = await esbuild.build({
    stdin: {
      contents: indexTs,
      resolveDir: rootDir,
      sourcefile: "index.ts",
      loader: "ts",
    },
    bundle: true,
    format: "cjs",
    platform: "neutral",
    target: "es2022",
    external: Object.keys(SANDBOX_LIBS),
    write: false,
    minify: true,
  });
  if ("stop" in esbuild) await esbuild.stop().catch(() => { });
  const bundle = outputFiles[0]?.text;
  if (!bundle) throw new Error("esbuild produced no output");

  const saved = await saveToCache("template-config", hash, "cjs", bundle);
  if ("error" in saved) {
    throw new Error(`Failed to cache bundle: ${saved.error}`);
  }

  const configs = await evaluateBundledCode(bundle);

  for (const key of Object.keys(configs)) {
    const mod = configs[key]!;
    const parsed = templateConfigSchema.safeParse(
      mod.templateConfig.templateConfig,
    );
    if (!parsed.success) {
      throw new Error(
        `Invalid template configuration in ${key}: ${parsed.error}`,
      );
    }
    mod.templateConfig.templateConfig = parsed.data;
  }
  return configs;
}
