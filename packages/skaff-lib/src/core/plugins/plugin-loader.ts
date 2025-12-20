import { ReadonlyProjectContext } from "@timonteutelink/template-types-lib";
import { builtinModules, createRequire } from "node:module";

import type { Result } from "../../lib/types";
import { getPluginSystemSettings } from "../../lib/config";
import type { Template } from "../templates/Template";
import {
  CliPluginContribution,
  LoadedTemplatePlugin,
  NormalizedTemplatePluginConfig,
  SkaffPluginModule,
  WebPluginContribution,
  normalizeTemplatePlugins,
  PluginManifest,
  pluginManifestSchema,
} from "./plugin-types";
import { createTemplateView } from "./template-view";
import {
  TemplateGenerationPlugin,
  TemplateGenerationPluginFactory,
  TemplatePluginFactoryInput,
} from "../generation/template-generation-types";
import { z } from "zod";
import { resolveHardenedSandbox } from "../infra/hardened-sandbox";
import { getPluginSandboxLibraries } from "../infra/sandbox-endowments";
import { getSkaffContainer } from "../../di/container";
import { EsbuildInitializerToken } from "../../di/tokens";

const BLOCKED_EXTERNALS = Array.from(
  new Set([
    ...builtinModules,
    ...builtinModules.map((entry) => `node:${entry}`),
  ]),
);

const MAX_HARDEN_DEPTH = 50;

const templateViewSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    config: z
      .object({
        name: z.string(),
        author: z.string(),
        specVersion: z.string(),
        description: z.string().optional(),
        multiInstance: z.boolean().optional(),
        isRootTemplate: z.boolean().optional(),
      })
      .strict(),
    subTemplateNames: z.array(z.string()),
    isDetachedSubtreeRoot: z.boolean(),
    commitHash: z.string().optional(),
    isLocal: z.boolean(),
  })
  .strict();

const projectContextSchema = z
  .object({
    projectRepositoryName: z.string(),
    projectAuthor: z.string(),
    rootTemplateName: z.string(),
  })
  .strict();

const templatePluginContextSchema = z
  .object({
    template: templateViewSchema,
    options: z.unknown().optional(),
    projectContext: projectContextSchema,
  })
  .strict();

function hardenOrDeepFreeze<T>(obj: T, seen = new WeakSet(), depth = 0): T {
  const hardenFn = (globalThis as { harden?: <T>(value: T) => T }).harden;
  if (typeof hardenFn === "function") {
    return hardenFn(obj);
  }

  if (depth > MAX_HARDEN_DEPTH) {
    return obj;
  }

  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (seen.has(obj as object)) {
    return obj;
  }
  seen.add(obj as object);

  const propNames = Object.getOwnPropertyNames(obj);
  for (const name of propNames) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(obj, name);
      if (descriptor && "value" in descriptor) {
        const value = descriptor.value;
        if (value !== null && typeof value === "object") {
          hardenOrDeepFreeze(value, seen, depth + 1);
        }
      }
    } catch {
      // Ignore inaccessible properties.
    }
  }

  return Object.freeze(obj) as T;
}

function buildWhitelistedProjectContext(
  projectContext: ReadonlyProjectContext,
): ReadonlyProjectContext {
  return {
    projectRepositoryName: projectContext.projectRepositoryName,
    projectAuthor: projectContext.projectAuthor,
    rootTemplateName: projectContext.rootTemplateName,
  };
}

function isTemplateGenerationPlugin(
  value: unknown,
): value is TemplateGenerationPlugin {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.configureTemplateInstantiationPipeline === "function" ||
    typeof candidate.configureProjectCreationPipeline === "function"
  );
}

// Create a module resolver that works in both ESM and CommonJS contexts
const getModuleUrl = (): string => {
  // In ESM, import.meta.url is available
  // In CommonJS, we fall back to __filename converted to URL
  if (typeof __filename !== "undefined") {
    return `file://${__filename}`;
  }
  // This branch is for ESM (when compiled to ESM or run with --experimental-vm-modules)
  // @ts-expect-error - import.meta only available in ESM context
  return import.meta.url;
};

const pluginModuleResolver = createRequire(getModuleUrl());

async function resolveEsbuild() {
  const initializer = getSkaffContainer().resolve(EsbuildInitializerToken);
  return initializer.init();
}

function coerceToPluginModule(entry: unknown): SkaffPluginModule | null {
  if (!entry || typeof entry !== "object") return null;
  if ("manifest" in (entry as Record<string, unknown>)) {
    return entry as SkaffPluginModule;
  }
  return null;
}

async function resolvePluginPath(
  reference: NormalizedTemplatePluginConfig,
  template: Template,
): Promise<Result<string>> {
  try {
    const resolved = pluginModuleResolver.resolve(reference.module, {
      paths: [template.absoluteDir, template.absoluteBaseDir, process.cwd()],
    });
    return { data: resolved };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      error: `Failed to resolve plugin ${reference.module} required by template ${template.config.templateConfig.name}: ${reason}`,
    };
  }
}

async function bundlePluginModule(
  reference: NormalizedTemplatePluginConfig,
  template: Template,
): Promise<Result<{ code: string; filename: string }>> {
  const resolvedPathResult = await resolvePluginPath(reference, template);
  if ("error" in resolvedPathResult) {
    return resolvedPathResult;
  }

  const resolvedPath = resolvedPathResult.data;
  const allowedModuleNames = Object.keys(getPluginSandboxLibraries());

  try {
    const esbuild = await resolveEsbuild();
    const { outputFiles } = await esbuild.build({
      entryPoints: [resolvedPath],
      bundle: true,
      format: "cjs",
      platform: "neutral",
      target: "es2022",
      write: false,
      minify: true,
      external: [...allowedModuleNames, ...BLOCKED_EXTERNALS],
      // NOTE: No banner/footer - the sandbox's evaluateCommonJs provides the CommonJS wrapper
    });
    if ("stop" in esbuild && esbuild.stop) await esbuild.stop();

    const code = outputFiles?.[0]?.text;
    if (!code) {
      return {
        error: `Failed to bundle plugin ${reference.module} required by template ${template.config.templateConfig.name}`,
      };
    }

    return { data: { code, filename: resolvedPath } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      error: `Failed to bundle plugin ${reference.module} required by template ${template.config.templateConfig.name}: ${reason}`,
    };
  }
}

function pickEntrypoint(moduleExports: any, exportName?: string): unknown {
  if (exportName && moduleExports && exportName in moduleExports) {
    return moduleExports[exportName];
  }
  if (moduleExports && "default" in moduleExports) {
    return moduleExports.default;
  }
  return moduleExports;
}

function buildTemplatePlugin(
  module: SkaffPluginModule,
  template: Template,
  reference: NormalizedTemplatePluginConfig,
  projectContext: ReadonlyProjectContext,
): Result<TemplateGenerationPlugin | undefined> {
  const entrypoint = module.template;
  if (!entrypoint) return { data: undefined };

  if (typeof entrypoint === "function") {
    // Create a minimal TemplateView instead of passing the full Template
    const templateView = createTemplateView(template);
    const factoryInput: TemplatePluginFactoryInput = {
      template: templateView,
      options: reference.options,
      projectContext: buildWhitelistedProjectContext(projectContext),
    };
    const parsed = templatePluginContextSchema.safeParse(factoryInput);
    if (!parsed.success) {
      return {
        error: `Invalid template plugin context for ${module.manifest.name}: ${parsed.error}`,
      };
    }

    const hardenedInput = hardenOrDeepFreeze(parsed.data);
    return {
      data: (entrypoint as TemplateGenerationPluginFactory)(hardenedInput),
    };
  }

  if (isTemplateGenerationPlugin(entrypoint)) {
    return { data: entrypoint };
  }

  return { data: undefined };
}

async function resolveEntrypoint<TEntry>(
  entry?: (() => TEntry | Promise<TEntry>) | TEntry,
): Promise<TEntry | undefined> {
  if (!entry) return undefined;
  if (typeof entry === "function") {
    return await (entry as () => TEntry | Promise<TEntry>)();
  }
  return entry;
}

async function buildCliPlugin(
  module: SkaffPluginModule,
): Promise<CliPluginContribution | undefined> {
  return resolveEntrypoint<CliPluginContribution>(module.cli);
}

async function buildWebPlugin(
  module: SkaffPluginModule,
): Promise<WebPluginContribution | undefined> {
  return resolveEntrypoint<WebPluginContribution>(module.web);
}

async function importPluginModule(
  reference: NormalizedTemplatePluginConfig,
  template: Template,
): Promise<Result<any>> {
  const bundleResult = await bundlePluginModule(reference, template);
  if ("error" in bundleResult) {
    return bundleResult;
  }

  try {
    const sandbox = resolveHardenedSandbox();
    const moduleExports = sandbox.evaluateCommonJs<any>({
      code: bundleResult.data.code,
      allowedModules: getPluginSandboxLibraries(),
      filename: bundleResult.data.filename,
    });

    return { data: moduleExports };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      error: `Failed to load plugin ${reference.module} required by template ${template.config.templateConfig.name}: ${reason}. Ensure the plugin is installed in the current Skaff environment.`,
    };
  }
}

function validateManifest(
  manifest: PluginManifest,
  module: SkaffPluginModule,
): Result<PluginManifest> {
  const parsed = pluginManifestSchema.safeParse(manifest);

  if (!parsed.success) {
    return { error: `Invalid plugin manifest: ${parsed.error}` };
  }

  const declaresSchema = parsed.data.schemas ?? {};

  if (module.globalConfigSchema && !declaresSchema.globalConfig) {
    return {
      error: `Plugin ${parsed.data.name} must declare globalConfig schema support in its manifest.schemas.globalConfig field when exporting globalConfigSchema`,
    };
  }

  if (module.inputSchema && !declaresSchema.input) {
    return {
      error: `Plugin ${parsed.data.name} must declare input schema support in its manifest.schemas.input field when exporting inputSchema`,
    };
  }

  if (module.outputSchema && !declaresSchema.output) {
    return {
      error: `Plugin ${parsed.data.name} must declare output schema support in its manifest.schemas.output field when exporting outputSchema`,
    };
  }

  if (
    parsed.data.requiredSettingsKeys?.length &&
    (!module.inputSchema || !module.outputSchema)
  ) {
    return {
      error: `Plugin ${parsed.data.name} declares required settings keys but does not export both inputSchema and outputSchema`,
    };
  }

  return { data: parsed.data };
}

function ensureCapabilities(
  manifest: PluginManifest,
  module: SkaffPluginModule,
): Result<void> {
  if (module.template && !manifest.capabilities.includes("template")) {
    return {
      error: `Plugin ${manifest.name} exposes a template hook but does not declare the 'template' capability in its manifest`,
    };
  }
  if (!module.template && manifest.supportedHooks.template.length) {
    return {
      error: `Plugin ${manifest.name} declares template hooks but does not export a template entrypoint`,
    };
  }

  if (module.cli && !manifest.capabilities.includes("cli")) {
    return {
      error: `Plugin ${manifest.name} exposes CLI contributions but does not declare the 'cli' capability in its manifest`,
    };
  }

  if (module.web && !manifest.capabilities.includes("web")) {
    return {
      error: `Plugin ${manifest.name} exposes web contributions but does not declare the 'web' capability in its manifest`,
    };
  }

  return { data: undefined };
}

async function readGlobalConfig(
  pluginModule: SkaffPluginModule,
  pluginName: string,
): Promise<Result<any>> {
  if (!pluginModule.globalConfigSchema) {
    return { data: undefined };
  }

  const rawSettings = await getPluginSystemSettings(pluginName);
  const parsed = pluginModule.globalConfigSchema.safeParse(rawSettings ?? {});

  if (!parsed.success) {
    return {
      error: `Invalid global config for plugin ${pluginName}: ${parsed.error}`,
    };
  }

  return { data: parsed.data };
}

/**
 * Loads plugins for a template using only project metadata (no full ProjectSettings).
 *
 * This ensures bijectional generation by preventing plugins from accessing
 * the instantiatedTemplates array or other templates' settings.
 *
 * @param template - The template to load plugins for
 * @param projectContext - Read-only project metadata (name, author, root template)
 * @returns Loaded plugins or an error
 */
export async function loadPluginsForTemplate(
  template: Template,
  projectContext: ReadonlyProjectContext,
): Promise<Result<LoadedTemplatePlugin[]>> {
  const normalized = normalizeTemplatePlugins(template.config.plugins);
  if (!normalized.length) {
    return { data: [] };
  }

  const loaded: LoadedTemplatePlugin[] = [];

  for (const reference of normalized) {
    const moduleResult = await importPluginModule(reference, template);
    if ("error" in moduleResult) {
      return { error: moduleResult.error };
    }

    const entry = pickEntrypoint(moduleResult.data, reference.exportName);
    const pluginModule = coerceToPluginModule(entry);
    if (!pluginModule) {
      return {
        error: `Plugin ${reference.module} did not export a usable entry point with a manifest`,
      };
    }

    const manifestResult = validateManifest(
      pluginModule.manifest,
      pluginModule,
    );

    if ("error" in manifestResult) {
      return manifestResult;
    }

    const manifest = manifestResult.data;
    const capabilityCheck = ensureCapabilities(manifest, pluginModule);

    if ("error" in capabilityCheck) {
      return capabilityCheck;
    }

    const pluginName = manifest.name;

    const globalConfigResult = await readGlobalConfig(pluginModule, pluginName);

    if ("error" in globalConfigResult) {
      return globalConfigResult;
    }

    const templatePluginResult = buildTemplatePlugin(
      pluginModule,
      template,
      reference,
      projectContext,
    );
    if ("error" in templatePluginResult) {
      return { error: templatePluginResult.error };
    }

    const [cliPlugin, webPlugin] = await Promise.all([
      buildCliPlugin(pluginModule),
      buildWebPlugin(pluginModule),
    ]);

    loaded.push({
      reference,
      module: pluginModule,
      name: pluginName,
      version: manifest.version,
      requiredSettingsKeys: manifest.requiredSettingsKeys,
      globalConfig: globalConfigResult.data,
      inputSchema:
        pluginModule.inputSchema ?? (z.object({}).strict() as z.ZodTypeAny),
      outputSchema:
        pluginModule.outputSchema ?? (z.object({}).strict() as z.ZodTypeAny),
      computeOutput: pluginModule.computeOutput,
      lifecycle: pluginModule.lifecycle,
      templatePlugin: templatePluginResult.data,
      cliPlugin,
      webPlugin,
    });

    // Invoke onLoad lifecycle hook after plugin is fully loaded
    if (pluginModule.lifecycle?.onLoad) {
      try {
        await pluginModule.lifecycle.onLoad({
          pluginName,
          pluginVersion: manifest.version,
          templateName: template.config.templateConfig.name,
          projectRepositoryName: projectContext.projectRepositoryName,
        });
      } catch (error) {
        // Call error handler if available
        if (pluginModule.lifecycle?.onError) {
          pluginModule.lifecycle.onError({
            pluginName,
            pluginVersion: manifest.version,
            error: error instanceof Error ? error : new Error(String(error)),
            phase: "load",
          });
        }
        return {
          error: `Plugin ${pluginName} onLoad hook failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  }

  return { data: loaded };
}
