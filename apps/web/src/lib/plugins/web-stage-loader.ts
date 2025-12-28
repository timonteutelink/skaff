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
  PluginStageEntry,
  TemplatePluginConfig,
  PluginTrustLevel,
} from "@timonteutelink/skaff-lib";
import type { WebPluginContribution, WebTemplateStage } from "./plugin-types";

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
 * Information about an available plugin.
 */
export interface AvailablePluginInfo {
  /** Plugin manifest name */
  name: string;
  /** npm package name */
  packageName: string;
  /** Installed version */
  version: string;
  /** Trust level of the plugin */
  trustLevel: PluginTrustLevel;
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
  available: AvailablePluginInfo[];
  /** Whether any plugins have trust warnings */
  hasTrustWarnings: boolean;
  /** Plugins that are not from official scopes */
  untrustedPlugins: AvailablePluginInfo[];
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

function pickEntrypoint(
  moduleExports: Record<string, unknown>,
  exportName?: string,
): unknown {
  if (exportName && exportName in moduleExports) {
    return moduleExports[exportName];
  }
  if ("default" in moduleExports) {
    return moduleExports.default;
  }
  return moduleExports;
}

function coerceToPluginModule(entry: unknown): SkaffPluginModule | null {
  if (!entry || typeof entry !== "object") return null;
  if ("manifest" in (entry as Record<string, unknown>)) {
    return entry as SkaffPluginModule;
  }
  return null;
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
  const plugins = template.plugins;

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

  const available: AvailablePluginInfo[] = result.compatible.map(
    (p: SinglePluginCompatibilityResult) => {
      const pluginName = extractPluginName(p.module);
      // Look up trust level from the manifest
      const manifestEntry = PLUGIN_MANIFEST.find(
        (m) => m.name === pluginName || m.packageName === p.module,
      );
      return {
        name: pluginName,
        packageName: p.module,
        version: p.installedVersion ?? "",
        trustLevel:
          manifestEntry?.trustLevel ?? ("unknown" as PluginTrustLevel),
      };
    },
  );

  // Identify plugins with trust warnings (not official)
  const untrustedPlugins = available.filter(
    (p) => p.trustLevel !== "official" && p.trustLevel !== "verified",
  );

  return {
    compatible: result.allCompatible,
    missing,
    available,
    hasTrustWarnings: untrustedPlugins.length > 0,
    untrustedPlugins,
  };
}

export type WebPluginStageEntry = PluginStageEntry<WebTemplateStage>;

export interface WebPluginRequirement {
  pluginName: string;
  requiredSettingsKeys: string[];
}

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
  const plugins = template.plugins;

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
    const moduleExports = getInstalledPlugin(pluginName);
    const resolvedModule = moduleExports ?? getInstalledPlugin(reference.module);
    if (!resolvedModule) continue;

    const entry = pickEntrypoint(resolvedModule, reference.exportName);
    const pluginModule = coerceToPluginModule(entry);
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

export async function loadWebTemplatePluginRequirements(
  template: TemplateDTO,
): Promise<WebPluginRequirement[]> {
  const normalized = normalizeTemplatePlugins(template.plugins);
  if (!normalized.length) return [];

  const compatibility = checkPluginCompatibility(template);
  const requirements: WebPluginRequirement[] = [];

  for (const reference of normalized) {
    const pluginName = extractPluginName(reference.module);
    const isCompatible = compatibility.available.some(
      (p) => p.name === pluginName || p.packageName === reference.module,
    );
    if (!isCompatible) {
      continue;
    }

    const moduleExports = getInstalledPlugin(pluginName);
    const resolvedModule = moduleExports ?? getInstalledPlugin(reference.module);
    if (!resolvedModule) continue;

    const entry = pickEntrypoint(resolvedModule, reference.exportName);
    const pluginModule = coerceToPluginModule(entry);
    if (!pluginModule?.manifest?.requiredSettingsKeys?.length) continue;

    requirements.push({
      pluginName: pluginModule.manifest.name ?? pluginName,
      requiredSettingsKeys: pluginModule.manifest.requiredSettingsKeys,
    });
  }

  return requirements;
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
