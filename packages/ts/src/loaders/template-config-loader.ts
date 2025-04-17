import {
  TemplateConfigModule,
  templateConfigSchema,
  TemplateSettingsType,
} from "@timonteutelink/template-types-lib";
import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import z from "zod";
import { retrieveFromCache, saveToCache } from "../services/cache-service";
import { getEsbuild } from "../utils/get-esbuild";

//TODO renovate, mkDocs, .github/settings.yml

/**
 * Holds information about a template configuration file and its optional reference.
 */
interface TemplateConfigFileInfo {
  configPath: string;
  refDir?: string;
}

export type TemplateConfigWithFileInfo = {
  templateConfig: TemplateConfigModule<
    TemplateSettingsType<z.AnyZodObject>,
    z.AnyZodObject
  >;
} & TemplateConfigFileInfo;

async function readTsConfig() {
  const module = await import("@repo/typescript-config/base.json", {
    with: { type: "json" },
  });
  const tsConfig = module.default;
  if (!tsConfig) {
    throw new Error("Failed to load tsconfig.json");
  }
  return tsConfig;
}

/**
 * Performs type checking on the given file using the TypeScript Compiler API.
 * It uses the compiler options loaded from your custom tsconfig.
 */
async function typeCheckFile(filePath: string): Promise<void> {
  const basePath = process.cwd();
  const tsConfig = await readTsConfig();
  const { options, errors } = ts.convertCompilerOptionsFromJson(
    { ...tsConfig.compilerOptions, baseUrl: basePath },
    basePath,
  );

  if (errors.length > 0) {
    const formatHost: ts.FormatDiagnosticsHost = {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine,
    };
    throw new Error(
      `Error in tsconfig:\n${ts.formatDiagnosticsWithColorAndContext(errors, formatHost)}`,
    );
  }

  const program = ts.createProgram([filePath], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    const formatHost: ts.FormatDiagnosticsHost = {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine,
    };
    throw new Error(
      `TypeScript type checking failed:\n${ts.formatDiagnosticsWithColorAndContext(
        diagnostics,
        formatHost,
      )}`,
    );
  }
}

/**
 * Recursively scans the given directory for template configuration files.
 * It looks for directories that either contain a templateConfig.ts file or a templateRef.json file.
 * For templateRef.json, it reads the JSON (expecting a single key with a relative path)
 * and includes the templateConfig.ts file from that referenced folder.
 */
async function findTemplateConfigFiles(dir: string): Promise<TemplateConfigFileInfo[]> {
  let results: TemplateConfigFileInfo[] = [];

  const candidate = path.join(dir, "templateConfig.ts");
  const candidateStat = await fs.stat(candidate).catch(() => null);
  if (candidateStat && candidateStat.isFile()) {
    results.push({ configPath: candidate });
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const refCandidate = path.join(fullPath, "templateRef.json");
      const refCandidateStat = await fs.stat(refCandidate).catch(() => null);
      if (refCandidateStat && refCandidateStat.isFile()) {
        try {
          const refData = JSON.parse(await fs.readFile(refCandidate, "utf-8"));
          const refRelativePath = Object.values(refData)[0];
          if (typeof refRelativePath === "string") {
            const resolvedRefDir = path.join(fullPath, refRelativePath);
            const resolvedRefPath = path.join(
              resolvedRefDir,
              "templateConfig.ts",
            );
            const resolvedRefPathStat = await fs.stat(resolvedRefPath).catch(() => null);
            if (resolvedRefPathStat && resolvedRefPathStat.isFile()) {
              results.push({ configPath: resolvedRefPath, refDir: fullPath });
              results = results.concat(
                await findTemplateConfigFilesInSubdirs(resolvedRefDir),
              );
            } else {
              console.warn(
                `Referenced templateConfig.ts not found at ${resolvedRefPath}`,
              );
            }
          }
        } catch (err) {
          console.warn(
            `Error parsing ${refCandidate}: ${(err as Error).message}`,
          );
        }
      } else {
        results = results.concat(await findTemplateConfigFiles(fullPath));
      }
    }
  }
  return results;
}

async function findTemplateConfigFilesInSubdirs(
  dir: string,
): Promise<TemplateConfigFileInfo[]> {
  let results: TemplateConfigFileInfo[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(await findTemplateConfigFiles(fullPath));
    }
  }
  return results;
}

/**
 * Imports and validates the bundled template configuration module.
 */
async function importTemplateConfigModule(
  cachePath: string,
): Promise<Record<string, TemplateConfigWithFileInfo>> {
  const moduleObj = await import(
    /* webpackIgnore: true */ pathToFileURL(cachePath).href
  );
  const configs = moduleObj.configs as Record<
    string,
    TemplateConfigWithFileInfo
  >;

  for (const key in configs) {
    const evaluatedModule = configs[key];
    if (!evaluatedModule) continue;
    const parsedTemplateConfig = templateConfigSchema.safeParse(
      evaluatedModule.templateConfig.templateConfig,
    );
    // TODO check name provided same as name of template folder
    if (!parsedTemplateConfig.success) {
      throw new Error(
        `Invalid template configuration in ${key}: ${parsedTemplateConfig.error.message}`,
      );
    }
    evaluatedModule.templateConfig.templateConfig = parsedTemplateConfig.data;
  }

  return configs;
}

/**
 * Loads and validates ALL template configuration files found under the provided rootDir.
 * It creates a temporary bundled module that imports all templateConfig.ts files found
 * (using relative imports) and exports them as a record keyed by their path relative to rootDir.
 * It also computes a hash of the combined template code and caches the built bundle using that hash.
 *
 * Additionally, before bundling, it writes an index.ts to the file system, type-checks it,
 * and removes it. This ensures that all modules type-check correctly.
 *
 * The exported value for each template now includes metadata for:
 *  - the path of the actual templateConfig.ts file, and
 *  - the path of the templateRef.json file (if applicable).
 */
export async function loadAllTemplateConfigs(
  rootDir: string,
): Promise<Record<string, TemplateConfigWithFileInfo>> {
  const configFiles = await findTemplateConfigFiles(rootDir);

  if (configFiles.length === 0) {
    throw new Error(`No templateConfig.ts files found under ${rootDir}`);
  }

  const sortedFiles = configFiles.sort((a, b) =>
    a.configPath.localeCompare(b.configPath),
  );
  let combinedContent = "";
  for (const fileInfo of sortedFiles) {
    combinedContent += await fs.readFile(fileInfo.configPath, "utf-8");
  }
  const hash = createHash("sha256").update(combinedContent).digest("hex");

  const cachedBundle = await retrieveFromCache('template-config', hash, "mjs");

  if ("error" in cachedBundle) {
    console.error(
      `Failed to retrieve cached bundle for template configs: ${cachedBundle.error}`,
    );
  } else if (cachedBundle.data) {
    console.log(`Using cached bundle at ${cachedBundle.data.path}`);
    return importTemplateConfigModule(cachedBundle.data.path);
  }

  let importsCode = "";
  const exportEntries: string[] = [];
  sortedFiles.forEach((fileInfo, index) => {
    const relConfigPath = path
      .relative(rootDir, fileInfo.configPath)
      .replace(/\\/g, "/");
    const importPath = `./${relConfigPath.replace(/\.ts$/, "")}`;
    const importAlias = `config${index}`;
    importsCode += `import ${importAlias} from '${importPath}';\n`;

    let entry = `'${relConfigPath}': { templateConfig: ${importAlias}, configPath: '${relConfigPath}'`;
    if (fileInfo.refDir) {
      const relRefPath = path
        .relative(rootDir, fileInfo.refDir)
        .replace(/\\/g, "/");
      entry += `, refDir: '${relRefPath}'`;
    }
    entry += " }";
    exportEntries.push(entry);
  });
  // add type info for full type checks. Probably something like Record<string, TemplateConfigModule<any>>
  const indexCode = `${importsCode}\nexport const configs = {\n${exportEntries.join(
    ",\n",
  )}\n};`;

  const tempIndexPath = path.join(rootDir, `.__temp_index_${randomUUID()}.ts`);
  await fs.writeFile(tempIndexPath, indexCode, "utf-8");
  try {
    await typeCheckFile(tempIndexPath);
    console.log(
      `Temporary index file at ${tempIndexPath} passed type checking.`,
    );
  } finally {
    await fs.unlink(tempIndexPath);
  }

  const esbuild = await getEsbuild();

  const result = await esbuild.build({
    stdin: {
      contents: indexCode,
      resolveDir: rootDir,
      sourcefile: "index.ts",
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    target: "es2022",
  });

  const bundledCode = result.outputFiles[0]?.text;
  if (!bundledCode) {
    throw new Error(`Failed to bundle template configs from ${rootDir}`);
  }

  const resultPath = await saveToCache('template-config', hash, "mjs", bundledCode);
  console.log(`Created bundled template configs at ${resultPath}`);

  if ("error" in resultPath) {
    throw new Error(`Failed to save bundled template configs: ${resultPath.error}`);
  }

  if ('stop' in esbuild) {
    try {
      await esbuild.stop();
    } catch {

    }
  }

  return importTemplateConfigModule(resultPath.data);
}
