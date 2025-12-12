import path from "node:path";
import { createRequire } from "module";
import { pathToFileURL } from "node:url";

import { ProjectSettings } from "@timonteutelink/template-types-lib";

import type { Result } from "../../lib/types";
import type { Template } from "../templates/Template";
import {
  CliPluginContribution,
  LoadedTemplatePlugin,
  NormalizedTemplatePluginConfig,
  SkaffPluginModule,
  WebPluginContribution,
  normalizeTemplatePlugins,
} from "./plugin-types";
import {
  TemplateGenerationPlugin,
  TemplateGenerationPluginFactory,
} from "../generation/template-generation-types";

function isTemplateGenerationPlugin(value: unknown): value is TemplateGenerationPlugin {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.configureTemplateInstantiationPipeline === "function" ||
    typeof candidate.configureProjectCreationPipeline === "function"
  );
}

function coerceToPluginModule(entry: unknown): SkaffPluginModule | null {
  if (!entry) return null;
  if (isTemplateGenerationPlugin(entry)) {
    return { template: entry } satisfies SkaffPluginModule;
  }
  if (typeof entry === "function") {
    return { template: entry as TemplateGenerationPluginFactory };
  }
  if (typeof entry === "object") {
    return entry as SkaffPluginModule;
  }
  return null;
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
  projectSettings: ProjectSettings,
): TemplateGenerationPlugin | undefined {
  const entrypoint = module.template;
  if (!entrypoint) return undefined;

  if (typeof entrypoint === "function") {
    return (entrypoint as TemplateGenerationPluginFactory)({
      template,
      options: reference.options,
      projectSettings,
    });
  }

  if (isTemplateGenerationPlugin(entrypoint)) {
    return entrypoint;
  }

  return undefined;
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

async function importFromTemplate(
  specifier: string,
  templateBaseDir: string,
): Promise<Result<any>> {
  try {
    const requireFromTemplate = createRequire(
      path.join(templateBaseDir, "package.json"),
    );
    const resolved = requireFromTemplate.resolve(specifier);
    const imported = await import(pathToFileURL(resolved).href);
    return { data: imported };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      error: `Failed to load plugin ${specifier} from ${templateBaseDir}: ${reason}`,
    };
  }
}

export async function loadPluginsForTemplate(
  template: Template,
  projectSettings: ProjectSettings,
): Promise<Result<LoadedTemplatePlugin[]>> {
  const normalized = normalizeTemplatePlugins(template.config.plugins);
  if (!normalized.length) {
    return { data: [] };
  }

  const loaded: LoadedTemplatePlugin[] = [];

  for (const reference of normalized) {
    const moduleResult = await importFromTemplate(
      reference.module,
      template.absoluteBaseDir,
    );
    if ("error" in moduleResult) {
      return { error: moduleResult.error };
    }

    const entry = pickEntrypoint(moduleResult.data, reference.exportName);
    const pluginModule = coerceToPluginModule(entry);
    if (!pluginModule) {
      return {
        error: `Plugin ${reference.module} did not export a usable entry point`,
      };
    }

    const templatePlugin = buildTemplatePlugin(
      pluginModule,
      template,
      reference,
      projectSettings,
    );

    const [cliPlugin, webPlugin] = await Promise.all([
      buildCliPlugin(pluginModule),
      buildWebPlugin(pluginModule),
    ]);

    loaded.push({
      reference,
      module: pluginModule,
      templatePlugin,
      cliPlugin,
      webPlugin,
    });
  }

  return { data: loaded };
}
