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
import { initEsbuild } from "../utils/get-esbuild";
import { existsSync } from "node:fs";
import { GenericTemplateConfigModule } from "../lib";

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
  templateConfig: GenericTemplateConfigModule
} & TemplateConfigFileInfo;

async function readTsConfig(): Promise<any> {
  return {
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["ES2022"],

      "module": "NodeNext",
      "moduleResolution": "NodeNext",

      "types": ["node"],

      "strict": true,
      "skipLibCheck": true         // speeds up builds; safe for CLIs
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

function findTypesDirectory(startDir: string): string | null {
  let currentDir = startDir;

  while (currentDir !== path.parse(currentDir).root) {
    const typesPath = path.join(currentDir, 'node_modules', '@types');
    if (existsSync(typesPath)) {
      return typesPath;
    }
    currentDir = path.dirname(currentDir);
  }

  // Fallback to the current working directory if @types exists there
  const fallbackPath = path.join(process.cwd(), 'node_modules', '@types');
  return existsSync(fallbackPath) ? fallbackPath : null;
}

async function typeCheckFile(filePath: string): Promise<void> {
  const templateDir = path.dirname(filePath);

  const typeRoots = [
    findTypesDirectory(templateDir) || path.join(process.cwd(), 'node_modules', '@types'),
  ];

  const tsConfig = await readTsConfig();
  const { options, errors } = ts.convertCompilerOptionsFromJson(
    {
      ...tsConfig.compilerOptions,
      typeRoots,
    },
    templateDir,
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

// TODO NEW add extra templateloader step that checks all "templates" and checks if all values used in templates are provided in FinalTemplateSettings
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
  const { Script, createContext } = await import(/* webpackIgnore: true */ "node:vm");

  function safeRequire(id: string) {
    if (id in SANDBOX_LIBS) return SANDBOX_LIBS[id];
    const rootId = id.split("/", 1)[0]!;
    if (rootId in SANDBOX_LIBS) return SANDBOX_LIBS[rootId];
    throw new Error(`Blocked import: ${id}`);
  }

  const contextModule = { exports: {} };
  const context = createContext({
    exports: contextModule.exports,
    require: safeRequire,
    module: contextModule,
    __filename: "",
    __dirname: "",
  });
  const script = new Script(code + "(exports, require, module, __filename, __dirname);", { filename: "template-bundle.cjs" });
  script.runInContext(context);
  return (contextModule.exports as any).configs;
}

export async function loadAllTemplateConfigs(
  rootDir: string,
  commitHash: string,
): Promise<Record<string, TemplateConfigWithFileInfo>> {
  if (!commitHash.trim()) {
    throw new Error("commitHash is required to load template configurations");
  }
  const files = await findTemplateConfigFiles(rootDir);
  if (files.length === 0) {
    throw new Error(`No templateConfig.ts files found under ${rootDir}`);
  }

  const cacheKey = getHash(
    `${commitHash}:${path.resolve(rootDir)}`,
  );

  const cached = await retrieveFromCache("template-config", cacheKey, "cjs");
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

  const esbuild = await initEsbuild();
  if (!esbuild) {
    throw new Error("Failed to initialize esbuild");
  }
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
    banner: {
      js: `;(function(exports, require, module, __filename, __dirname) {`
    },
    footer: {
      js: `\n})`
    },
  });
  if ("stop" in esbuild && esbuild.stop) await esbuild.stop();
  const bundle = outputFiles[0]?.text;
  if (!bundle) throw new Error("esbuild produced no output");

  const saved = await saveToCache(
    "template-config",
    cacheKey,
    "cjs",
    bundle,
  );
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
