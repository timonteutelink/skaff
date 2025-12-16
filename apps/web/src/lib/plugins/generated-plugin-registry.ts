/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 *
 * This file is generated at build time by scripts/generate-plugin-registry.ts
 * It contains static imports for all installed Skaff web plugins.
 *
 * To add or remove plugins, modify the SKAFF_PLUGINS build argument or
 * update package.json dependencies, then rebuild.
 *
 * This is the default empty registry. Run `bun run generate:plugins` to
 * regenerate this file with any installed plugins.
 */

import type {
  SkaffPluginModule,
  PluginTrustLevel,
} from "@timonteutelink/skaff-lib";

export interface InstalledPluginEntry {
  module: SkaffPluginModule;
  packageName: string;
  version: string;
  trustLevel: PluginTrustLevel;
}

export interface PluginManifestEntry {
  name: string;
  packageName: string;
  version: string;
  trustLevel: PluginTrustLevel;
}

/**
 * Registry of all installed plugins, keyed by plugin manifest name.
 * These plugins are bundled at build time and available for use.
 */
export const INSTALLED_PLUGINS: Record<string, InstalledPluginEntry> = {};

/**
 * List of installed plugin metadata for display purposes.
 */
export const PLUGIN_MANIFEST: PluginManifestEntry[] = [];

/**
 * Get a plugin by its manifest name.
 */
export function getInstalledPlugin(name: string): SkaffPluginModule | null {
  return INSTALLED_PLUGINS[name]?.module ?? null;
}

/**
 * Get all installed plugin names.
 */
export function getInstalledPluginNames(): string[] {
  return Object.keys(INSTALLED_PLUGINS);
}

/**
 * Check if a plugin is installed.
 */
export function isPluginInstalled(name: string): boolean {
  return name in INSTALLED_PLUGINS;
}

/**
 * Get plugin version by name.
 */
export function getPluginVersion(name: string): string | null {
  return INSTALLED_PLUGINS[name]?.version ?? null;
}

/**
 * Get plugin trust level by name.
 */
export function getPluginTrustLevel(name: string): PluginTrustLevel | null {
  return INSTALLED_PLUGINS[name]?.trustLevel ?? null;
}
