/**
 * Plugin Compatibility Checking
 *
 * This module provides functions to check if installed plugins satisfy
 * the version constraints specified by templates.
 */

import * as semver from "semver";
import type { TemplatePluginConfig } from "@timonteutelink/template-types-lib";
import {
  normalizeTemplatePlugins,
  type NormalizedTemplatePluginConfig,
} from "./plugin-types";
import { parsePackageSpec } from "./package-spec";

/**
 * Information about an installed plugin.
 */
export interface InstalledPluginInfo {
  /** The plugin's manifest name */
  name: string;
  /** The installed version */
  version: string;
  /** The npm package name (may differ from manifest name) */
  packageName?: string;
}

/**
 * Reasons why a plugin might be incompatible.
 */
export type PluginIncompatibilityReason =
  | "not_installed"
  | "version_mismatch"
  | "invalid_version_constraint"
  | "invalid_installed_version";

/**
 * Result of checking a single plugin's compatibility.
 */
export interface SinglePluginCompatibilityResult {
  /** The module specifier from the template config */
  module: string;
  /** Whether the plugin is compatible */
  compatible: boolean;
  /** The required version constraint (if specified) */
  requiredVersion?: string;
  /** The installed version (if available) */
  installedVersion?: string;
  /** Reason for incompatibility (if not compatible) */
  reason?: PluginIncompatibilityReason;
  /** Human-readable message explaining the result */
  message?: string;
}

/**
 * Result of checking all plugins required by a template.
 */
export interface TemplatePluginCompatibilityResult {
  /** Whether all required plugins are compatible */
  allCompatible: boolean;
  /** Results for each plugin check */
  plugins: SinglePluginCompatibilityResult[];
  /** List of missing plugins */
  missing: SinglePluginCompatibilityResult[];
  /** List of plugins with version mismatches */
  versionMismatches: SinglePluginCompatibilityResult[];
  /** List of compatible plugins */
  compatible: SinglePluginCompatibilityResult[];
}

/**
 * Extracts the plugin name from a module specifier.
 * Handles scoped packages like @scope/plugin-name and version suffixes.
 *
 * @param moduleSpecifier - The module specifier (e.g., "@skaff/plugin-foo@1.0.0")
 * @returns The cleaned plugin name (e.g., "@skaff/plugin-foo")
 */
export function extractPluginName(moduleSpecifier: string): string {
  return parsePackageSpec(moduleSpecifier).name;
}

/**
 * Checks if an installed plugin version satisfies a version constraint.
 *
 * @param installedVersion - The installed plugin version
 * @param versionConstraint - The semver version constraint (e.g., "^1.0.0", ">=2.0.0")
 * @returns Object with compatibility result and any error message
 */
export function checkVersionSatisfies(
  installedVersion: string,
  versionConstraint: string,
): { satisfies: boolean; error?: string } {
  // Validate the installed version is valid semver
  const cleanedInstalled = semver.clean(installedVersion);
  if (!cleanedInstalled) {
    return {
      satisfies: false,
      error: `Invalid installed version: "${installedVersion}" is not valid semver`,
    };
  }

  // Validate the version constraint is a valid range
  const validRange = semver.validRange(versionConstraint);
  if (!validRange) {
    return {
      satisfies: false,
      error: `Invalid version constraint: "${versionConstraint}" is not a valid semver range`,
    };
  }

  // Check if the installed version satisfies the constraint
  const satisfies = semver.satisfies(cleanedInstalled, versionConstraint);
  return { satisfies };
}

/**
 * Checks if a single plugin is compatible.
 *
 * @param pluginConfig - The plugin configuration from the template
 * @param installedPlugins - Map of installed plugins (name -> info)
 * @returns The compatibility result for this plugin
 */
export function checkSinglePluginCompatibility(
  pluginConfig: NormalizedTemplatePluginConfig,
  installedPlugins: Map<string, InstalledPluginInfo>,
): SinglePluginCompatibilityResult {
  const pluginName = extractPluginName(pluginConfig.module);

  // Try to find the plugin by name or package name
  let installedPlugin = installedPlugins.get(pluginName);

  // Also try the full module specifier as a fallback
  if (!installedPlugin) {
    installedPlugin = installedPlugins.get(pluginConfig.module);
  }

  // Also try matching by packageName
  if (!installedPlugin) {
    for (const [, info] of installedPlugins) {
      if (
        info.packageName === pluginConfig.module ||
        info.packageName === pluginName
      ) {
        installedPlugin = info;
        break;
      }
    }
  }

  if (!installedPlugin) {
    return {
      module: pluginConfig.module,
      compatible: false,
      requiredVersion: pluginConfig.version,
      reason: "not_installed",
      message: `Plugin "${pluginName}" is not installed`,
    };
  }

  // If no version constraint specified, just being installed is enough
  if (!pluginConfig.version) {
    return {
      module: pluginConfig.module,
      compatible: true,
      installedVersion: installedPlugin.version,
      message: `Plugin "${pluginName}" is installed (v${installedPlugin.version})`,
    };
  }

  // Check version compatibility
  const { satisfies, error } = checkVersionSatisfies(
    installedPlugin.version,
    pluginConfig.version,
  );

  if (error) {
    // Determine if the error is with the constraint or the installed version
    const isConstraintError = error.includes("constraint");
    return {
      module: pluginConfig.module,
      compatible: false,
      requiredVersion: pluginConfig.version,
      installedVersion: installedPlugin.version,
      reason: isConstraintError
        ? "invalid_version_constraint"
        : "invalid_installed_version",
      message: error,
    };
  }

  if (!satisfies) {
    return {
      module: pluginConfig.module,
      compatible: false,
      requiredVersion: pluginConfig.version,
      installedVersion: installedPlugin.version,
      reason: "version_mismatch",
      message: `Plugin "${pluginName}" v${installedPlugin.version} does not satisfy version constraint "${pluginConfig.version}"`,
    };
  }

  return {
    module: pluginConfig.module,
    compatible: true,
    requiredVersion: pluginConfig.version,
    installedVersion: installedPlugin.version,
    message: `Plugin "${pluginName}" v${installedPlugin.version} satisfies "${pluginConfig.version}"`,
  };
}

/**
 * Checks if all plugins required by a template are compatible with installed plugins.
 *
 * @param templatePlugins - The plugin configurations from the template
 * @param installedPlugins - Map of installed plugins (name -> info)
 * @returns The overall compatibility result
 */
export function checkTemplatePluginCompatibility(
  templatePlugins: TemplatePluginConfig[] | undefined | null,
  installedPlugins: Map<string, InstalledPluginInfo>,
): TemplatePluginCompatibilityResult {
  const normalized = normalizeTemplatePlugins(templatePlugins);

  if (!normalized.length) {
    return {
      allCompatible: true,
      plugins: [],
      missing: [],
      versionMismatches: [],
      compatible: [],
    };
  }

  const results: SinglePluginCompatibilityResult[] = [];
  const missing: SinglePluginCompatibilityResult[] = [];
  const versionMismatches: SinglePluginCompatibilityResult[] = [];
  const compatible: SinglePluginCompatibilityResult[] = [];

  for (const pluginConfig of normalized) {
    const result = checkSinglePluginCompatibility(
      pluginConfig,
      installedPlugins,
    );
    results.push(result);

    if (result.compatible) {
      compatible.push(result);
    } else if (result.reason === "not_installed") {
      missing.push(result);
    } else {
      versionMismatches.push(result);
    }
  }

  return {
    allCompatible: missing.length === 0 && versionMismatches.length === 0,
    plugins: results,
    missing,
    versionMismatches,
    compatible,
  };
}

/**
 * Creates a human-readable summary of plugin compatibility.
 *
 * @param result - The compatibility result to summarize
 * @returns A string summary suitable for display
 */
export function formatCompatibilitySummary(
  result: TemplatePluginCompatibilityResult,
): string {
  if (result.allCompatible) {
    if (result.plugins.length === 0) {
      return "No plugins required";
    }
    return `All ${result.plugins.length} required plugin(s) are compatible`;
  }

  const lines: string[] = [];

  if (result.missing.length > 0) {
    lines.push(`Missing plugins (${result.missing.length}):`);
    for (const p of result.missing) {
      const version = p.requiredVersion ? `@${p.requiredVersion}` : "";
      lines.push(`  - ${extractPluginName(p.module)}${version}`);
    }
  }

  if (result.versionMismatches.length > 0) {
    lines.push(`Version mismatches (${result.versionMismatches.length}):`);
    for (const p of result.versionMismatches) {
      lines.push(
        `  - ${extractPluginName(p.module)}: installed v${p.installedVersion}, requires ${p.requiredVersion}`,
      );
    }
  }

  return lines.join("\n");
}
