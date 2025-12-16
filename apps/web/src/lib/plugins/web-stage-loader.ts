/**
 * Web Plugin Stage Loader
 *
 * This module provides functions to load web plugin stages from the static
 * plugin registry. Plugins are bundled at build time, eliminating the need
 * for dynamic imports and ensuring security.
 *
 * SECURITY: All plugins are installed at Docker build time via the
 * SKAFF_PLUGINS build argument. No runtime plugin loading is supported.
 */

import type {
  SkaffPluginModule,
  WebPluginContribution,
  WebTemplateStage,
  PluginStageEntry,
  TemplatePluginConfig,
} from "@timonteutelink/skaff-lib";

import {
  normalizeTemplatePlugins,
  createPluginStageEntry,
  checkTemplatePluginCompatibility,
  extractPluginName,
  type InstalledPluginInfo,
  type TemplatePluginCompatibilityResult,
  type SinglePluginCompatibilityResult,
} from "@timonteutelink/skaff-lib";

import type { TemplateDTO } from "@timonteutelink/skaff-lib/browser";

import {
  getInstalledPlugin,
  PLUGIN_MANIFEST,
  type PluginManifestEntry,
} from "./generated-plugin-registry";

/**
 * Information about a plugin that is required but not installed.
 */
export interface MissingPluginInfo {
  /** The module specifier from the template config */
  module: string;
  /** The required version constraint (if specified) */
  requiredVersion?: string;
  /** Reason why the plugin cannot be used */
  reason: "not_installed" | "version_mismatch";
  /** Installed version if available but incompatible */
  installedVersion?: string;
  /** Human-readable message explaining the issue */
  message?: string;
}

/**
 * Result of checking plugin compatibility for a template.
 */
export interface PluginCompatibilityResult {
  /** Whether all required plugins are available and version-compatible */
  compatible: boolean;
  /** List of missing or incompatible plugins */
  missing: MissingPluginInfo[];
  /** List of available and compatible plugins */
  available: PluginManifestEntry[];
}

/**
 * Builds a Map of installed plugins from the static registry.
 * This is used by the skaff-lib compatibility checker.
 */
function buildInstalledPluginsMap(): Map<string, InstalledPluginInfo> {
  const map = new Map<string, InstalledPluginInfo>();

  for (const entry of PLUGIN_MANIFEST) {
    // Add by manifest name
    map.set(entry.name, {
      name: entry.name,
      version: entry.version,
      packageName: entry.packageName,
    });

    // Also add by package name for lookups
    if (entry.packageName && entry.packageName !== entry.name) {
      map.set(entry.packageName, {
        name: entry.name,
        version: entry.version,
        packageName: entry.packageName,
      });
    }
  }

  return map;
}

/**
 * Resolves a web plugin contribution from a plugin module.
 */
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

/**
 * Check if a template's required plugins are all installed and version-compatible.
 * Templates with missing or incompatible plugins should be disabled in the UI.
 *
 * This function uses semver to check version constraints specified in template configs.
 */
export function checkPluginCompatibility(
  template: TemplateDTO,
): PluginCompatibilityResult {
  const plugins = (template.config.templateConfig.plugins ??
    template.plugins) as TemplatePluginConfig[] | undefined;

  // Use the skaff-lib compatibility checker with semver support
  const installedPluginsMap = buildInstalledPluginsMap();
  const result: TemplatePluginCompatibilityResult =
    checkTemplatePluginCompatibility(plugins, installedPluginsMap);

  // Convert to the web-specific format
  const missing: MissingPluginInfo[] = [
    ...result.missing.map((p: SinglePluginCompatibilityResult) => ({
      module: p.module,
      requiredVersion: p.requiredVersion,
      reason: "not_installed" as const,
      message: p.message,
    })),
    ...result.versionMismatches.map((p: SinglePluginCompatibilityResult) => ({
      module: p.module,
      requiredVersion: p.requiredVersion,
      installedVersion: p.installedVersion,
      reason: "version_mismatch" as const,
      message: p.message,
    })),
  ];

  const available: PluginManifestEntry[] = result.compatible.map(
    (p: SinglePluginCompatibilityResult) => {
      const pluginName = extractPluginName(p.module);
      return {
        name: pluginName,
        packageName: p.module,
        version: p.installedVersion ?? "",
      };
    },
  );

  return {
    compatible: result.allCompatible,
    missing,
    available,
  };
}

export type WebPluginStageEntry = PluginStageEntry<WebTemplateStage>;

/**
 * Load web template stages for a template from the static plugin registry.
 *
 * This function:
 * 1. Reads the template's plugin configuration
 * 2. Looks up each plugin in the static registry (no dynamic imports)
 * 3. Checks version compatibility using semver
 * 4. Extracts and returns web stages with proper namespacing
 *
 * If a required plugin is not installed or version-incompatible, it will be skipped.
 * Use checkPluginCompatibility() first to show users which plugins are missing.
 */
export async function loadWebTemplateStages(
  template: TemplateDTO,
): Promise<WebPluginStageEntry[]> {
  const plugins = (template.config.templateConfig.plugins ??
    template.plugins) as TemplatePluginConfig[] | undefined;

  const normalized = normalizeTemplatePlugins(plugins);

  if (!normalized.length) return [];

  // First, check compatibility to filter out incompatible plugins
  const compatibility = checkPluginCompatibility(template);

  const stages: WebPluginStageEntry[] = [];

  for (const reference of normalized) {
    const pluginName = extractPluginName(reference.module);

    // Check if this plugin is in the compatible list
    const isCompatible = compatibility.available.some(
      (p) => p.name === pluginName || p.packageName === reference.module,
    );

    if (!isCompatible) {
      // Plugin is missing or version-incompatible - skip
      continue;
    }

    // Look up plugin in static registry
    const module = getInstalledPlugin(pluginName);
    const pluginModule = module ?? getInstalledPlugin(reference.module);
    if (!pluginModule) continue;

    // Resolve web contribution
    const web = await resolveWebContribution(pluginModule);
    if (!web?.templateStages?.length) continue;

    // Get the actual plugin name from manifest
    const manifestName = pluginModule.manifest?.name || pluginName;

    for (const stage of web.templateStages) {
      // Use createPluginStageEntry for automatic state key namespacing
      stages.push(createPluginStageEntry(manifestName, stage));
    }
  }

  return stages;
}

/**
 * Get all installed plugins' manifest entries.
 */
export function getInstalledPlugins(): PluginManifestEntry[] {
  return [...PLUGIN_MANIFEST];
}

/**
 * Check if any plugins are installed.
 */
export function hasInstalledPlugins(): boolean {
  return PLUGIN_MANIFEST.length > 0;
}
