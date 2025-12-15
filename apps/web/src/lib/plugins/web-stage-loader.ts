import {
  type LoadedTemplatePlugin,
  type NormalizedTemplatePluginConfig,
  type SkaffPluginModule,
  type TemplatePluginConfig,
  type WebPluginContribution,
  type WebTemplateStage,
  type PluginStageEntry,
  normalizeTemplatePlugins,
  createPluginStageEntry,
} from "@timonteutelink/skaff-lib";

import type { TemplateDTO } from "@timonteutelink/skaff-lib/browser";

function isTemplateGenerationPluginModule(
  entry: unknown,
): entry is SkaffPluginModule {
  if (!entry || typeof entry !== "object") return false;
  return (
    "template" in entry || "cli" in entry || "web" in entry || "name" in entry
  );
}

function coerceToPluginModule(entry: unknown): SkaffPluginModule | null {
  if (!entry) return null;
  if (typeof entry === "function") {
    return { template: entry } as SkaffPluginModule;
  }
  if (isTemplateGenerationPluginModule(entry)) {
    return entry as SkaffPluginModule;
  }
  return null;
}

function pickEntrypoint(
  moduleExports: Record<string, unknown>,
  exportName?: string,
): unknown {
  if (exportName && moduleExports && exportName in moduleExports) {
    return moduleExports[exportName];
  }
  if (moduleExports && "default" in moduleExports) {
    return moduleExports.default;
  }
  return moduleExports;
}

async function resolveWebContribution(
  module: SkaffPluginModule,
): Promise<WebPluginContribution | undefined> {
  const entry = module.web;
  if (!entry) return undefined;
  if (typeof entry === "function") {
    return await entry();
  }
  return entry;
}

async function loadPluginModule(
  reference: NormalizedTemplatePluginConfig,
): Promise<SkaffPluginModule | null> {
  try {
    const imported = await import(reference.module);
    const entry = pickEntrypoint(imported, reference.exportName);
    return coerceToPluginModule(entry);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Failed to load plugin ${reference.module}:`, error);
    return null;
  }
}

export type WebPluginStageEntry = PluginStageEntry<WebTemplateStage>;

export async function loadWebTemplateStages(
  template: TemplateDTO,
): Promise<WebPluginStageEntry[]> {
  const normalized = normalizeTemplatePlugins(
    (template.config.templateConfig.plugins ?? template.plugins) as
      | TemplatePluginConfig[]
      | undefined,
  );

  if (!normalized.length) return [];

  const stages: WebPluginStageEntry[] = [];

  for (const reference of normalized) {
    const module = await loadPluginModule(reference);
    if (!module) continue;

    const web = await resolveWebContribution(module);
    if (!web?.templateStages?.length) continue;

    const pluginName = module.manifest?.name || reference.module;

    for (const stage of web.templateStages) {
      // Use createPluginStageEntry for automatic state key namespacing
      stages.push(createPluginStageEntry(pluginName, stage));
    }
  }

  return stages;
}
