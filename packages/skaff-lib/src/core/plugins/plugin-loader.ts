import { ReadonlyProjectContext } from "@timonteutelink/template-types-lib";

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
  sortLoadedPluginsForLifecycle,
  UiPluginFactoryInput,
} from "./plugin-types";
import { createTemplateView } from "./template-view";
import {
  TemplateGenerationPlugin,
  TemplateGenerationPluginFactory,
  TemplatePluginFactoryInput,
} from "../generation/template-generation-types";
import { z } from "zod";
import { resolveHardenedSandbox } from "../infra/hardened-sandbox";
import { extractPluginName } from "./plugin-compatibility";
import { getPluginSandboxLibraries } from "../infra/sandbox-endowments";
import { getSkaffContainer } from "../../di/container";
import { EsbuildInitializerToken } from "../../di/tokens";
import path from "node:path";

const projectContextSchema = z
  .object({
    projectRepositoryName: z.string(),
    projectAuthor: z.string(),
    rootTemplateName: z.string(),
  })
  .strict();

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

const templatePluginFactoryInputSchema = z
  .object({
    template: templateViewSchema,
    options: z.unknown().optional(),
    projectContext: projectContextSchema,
  })
  .strict();

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

export interface RegisteredPluginModule {
  moduleExports?: unknown;
  modulePath?: string;
  sandboxedExports?: unknown;
  packageName?: string;
}

const registeredPlugins = new Map<string, RegisteredPluginModule>();

export function registerPluginModules(entries: RegisteredPluginModule[]): void {
  for (const entry of entries) {
    const packageName = entry.packageName;
    if (packageName) {
      registeredPlugins.set(packageName, entry);
      registeredPlugins.set(extractPluginName(packageName), entry);
    }
  }
}

export function clearRegisteredPluginModules(): void {
  registeredPlugins.clear();
}

function coerceToPluginModule(entry: unknown): SkaffPluginModule | null {
  if (!entry || typeof entry !== "object") return null;
  if ("manifest" in (entry as Record<string, unknown>)) {
    return entry as SkaffPluginModule;
  }
  return null;
}

export async function resolveRegisteredPluginModule(
  reference: NormalizedTemplatePluginConfig,
): Promise<Result<SkaffPluginModule>> {
  const moduleResult = resolveRegisteredPlugin(reference);
  if ("error" in moduleResult) {
    return moduleResult;
  }

  const exportsResult = await resolveSandboxedPluginExports(
    moduleResult.data,
    reference,
  );
  if ("error" in exportsResult) {
    return exportsResult;
  }

  const entry = pickEntrypoint(exportsResult.data, reference.exportName);
  const pluginModule = coerceToPluginModule(entry);
  if (!pluginModule) {
    return {
      error: `Plugin ${reference.module} did not export a usable entry point with a manifest`,
    };
  }

  return { data: pluginModule };
}

function resolveRegisteredPlugin(
  reference: NormalizedTemplatePluginConfig,
): Result<RegisteredPluginModule> {
  const key = extractPluginName(reference.module);
  const entry =
    registeredPlugins.get(reference.module) ?? registeredPlugins.get(key);
  if (entry) {
    return { data: entry };
  }

  return {
    error: `Plugin ${reference.module} is not installed in the current Skaff environment. Install it globally before running this template.`,
  };
}

async function bundlePluginModule(modulePath: string): Promise<Result<string>> {
  try {
    const esbuild = await getSkaffContainer()
      .resolve(EsbuildInitializerToken)
      .init();
    const { outputFiles, errors } = await esbuild.build({
      entryPoints: [modulePath],
      bundle: true,
      format: "cjs",
      platform: "node",
      target: "es2022",
      external: Object.keys(getPluginSandboxLibraries()),
      write: false,
      absWorkingDir: path.dirname(modulePath),
    });

    if (errors?.length) {
      return {
        error: `Failed to bundle plugin module ${modulePath}: ${errors.map((e) => e.text).join("; ")}`,
      };
    }

    const bundle = outputFiles?.[0]?.text;
    if (!bundle) {
      return { error: `Failed to bundle plugin module ${modulePath}` };
    }

    return { data: bundle };
  } catch (error) {
    return {
      error: `Failed to bundle plugin module ${modulePath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function resolveSandboxedPluginExports(
  entry: RegisteredPluginModule,
  reference: NormalizedTemplatePluginConfig,
): Promise<Result<unknown>> {
  if (entry.sandboxedExports) {
    return { data: entry.sandboxedExports };
  }

  if (!entry.modulePath) {
    return {
      error: `Plugin ${reference.module} must be registered with a modulePath for sandboxed evaluation.`,
    };
  }

  const bundleResult = await bundlePluginModule(entry.modulePath);
  if ("error" in bundleResult) {
    return bundleResult;
  }

  try {
    const sandbox = resolveHardenedSandbox();
    const exports = sandbox.evaluateCommonJs({
      code: bundleResult.data,
      allowedModules: getPluginSandboxLibraries(),
      filename: path.basename(entry.modulePath),
    });
    entry.sandboxedExports = exports;
    return { data: exports };
  } catch (error) {
    return {
      error: `Failed to evaluate plugin ${reference.module} in sandbox: ${error instanceof Error ? error.message : String(error)}`,
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
    const factoryInputCandidate: TemplatePluginFactoryInput = {
      template: templateView,
      options: reference.options,
      projectContext,
    };
    const parsedInput =
      templatePluginFactoryInputSchema.safeParse(factoryInputCandidate);
    if (!parsedInput.success) {
      return {
        error: `Invalid template plugin context for ${reference.module}: ${parsedInput.error}`,
      };
    }

    try {
      const sandbox = resolveHardenedSandbox();
      const hardenedInput = harden(parsedInput.data);
      const plugin = sandbox.invokeFunction(
        entrypoint as TemplateGenerationPluginFactory,
        hardenedInput,
      );
      return { data: plugin };
    } catch (error) {
      return {
        error: `Failed to initialize plugin ${reference.module}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  if (isTemplateGenerationPlugin(entrypoint)) {
    return { data: entrypoint };
  }

  return { data: undefined };
}

async function resolveEntrypoint<TEntry>(
  entry?: ((input?: UiPluginFactoryInput) => TEntry | Promise<TEntry>) | TEntry,
  input?: UiPluginFactoryInput,
): Promise<TEntry | undefined> {
  if (!entry) return undefined;
  if (typeof entry === "function") {
    return await (entry as (input?: UiPluginFactoryInput) => TEntry | Promise<TEntry>)(
      input,
    );
  }
  return entry;
}

async function buildCliPlugin(
  module: SkaffPluginModule,
  input?: UiPluginFactoryInput,
): Promise<CliPluginContribution | undefined> {
  return resolveEntrypoint<CliPluginContribution>(module.cli, input);
}

async function buildWebPlugin(
  module: SkaffPluginModule,
  input?: UiPluginFactoryInput,
): Promise<WebPluginContribution | undefined> {
  return resolveEntrypoint<WebPluginContribution>(module.web, input);
}


function validateManifest(
  manifest: PluginManifest,
  module: SkaffPluginModule,
): Result<PluginManifest> {
  const parsed = pluginManifestSchema.safeParse(manifest);

  if (!parsed.success) {
    return { error: `Invalid plugin manifest: ${parsed.error}` };
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

  const templateView = createTemplateView(template);
  const loaded: LoadedTemplatePlugin[] = [];

  for (const reference of normalized) {
    const moduleResult = resolveRegisteredPlugin(reference);
    if ("error" in moduleResult) {
      return { error: moduleResult.error };
    }

    const exportsResult = await resolveSandboxedPluginExports(
      moduleResult.data,
      reference,
    );
    if ("error" in exportsResult) {
      return exportsResult;
    }

    const entry = pickEntrypoint(exportsResult.data, reference.exportName);
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

    const uiInput: UiPluginFactoryInput = {
      template: templateView,
      options: reference.options,
      projectContext,
    };

    const templatePlugin = buildTemplatePlugin(
      pluginModule,
      template,
      reference,
      projectContext,
    );
    if ("error" in templatePlugin) {
      return { error: templatePlugin.error };
    }

    const [cliPlugin, webPlugin] = await Promise.all([
      buildCliPlugin(pluginModule, uiInput),
      buildWebPlugin(pluginModule, uiInput),
    ]);

    loaded.push({
      reference,
      module: pluginModule,
      name: pluginName,
      version: manifest.version,
      globalConfig: globalConfigResult.data,
      lifecycle: pluginModule.lifecycle,
      templatePlugin: templatePlugin.data,
      cliPlugin,
      webPlugin,
    });
  }

  const ordered = sortLoadedPluginsForLifecycle(loaded);

  for (const plugin of ordered) {
    if (!plugin.lifecycle?.onLoad) continue;

    try {
      await plugin.lifecycle.onLoad({
        pluginName: plugin.name,
        pluginVersion: plugin.version,
        templateName: template.config.templateConfig.name,
        projectRepositoryName: projectContext.projectRepositoryName,
      });
    } catch (error) {
      if (plugin.lifecycle?.onError) {
        plugin.lifecycle.onError({
          pluginName: plugin.name,
          pluginVersion: plugin.version,
          error: error instanceof Error ? error : new Error(String(error)),
          phase: "load",
        });
      }
      return {
        error: `Plugin ${plugin.name} onLoad hook failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return { data: ordered };
}
