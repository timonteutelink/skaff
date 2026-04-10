import { extractPluginName } from "@timonteutelink/skaff-lib/browser";
import type {
  MissingPluginInfo,
  PluginCompatibilityResult,
} from "./web-stage-loader";

export interface PluginCompatibilityBreakdown {
  missing: MissingPluginInfo[];
  versionMismatches: MissingPluginInfo[];
  invalidGlobalConfig: MissingPluginInfo[];
  templateSettingsWarnings: PluginCompatibilityResult["templateSettingsWarnings"];
  totalRequired: number;
}

export function getCompatibilityBreakdown(
  result: PluginCompatibilityResult,
): PluginCompatibilityBreakdown {
  const missing = result.missing.filter(
    (plugin) => plugin.reason === "not_installed",
  );
  const versionMismatches = result.missing.filter(
    (plugin) => plugin.reason === "version_mismatch",
  );
  const invalidGlobalConfig = result.missing.filter(
    (plugin) => plugin.reason === "invalid_global_config",
  );
  const totalRequired =
    missing.length +
    versionMismatches.length +
    invalidGlobalConfig.length +
    result.available.length;

  return {
    missing,
    versionMismatches,
    invalidGlobalConfig,
    templateSettingsWarnings: result.templateSettingsWarnings,
    totalRequired,
  };
}

export function formatPluginRequirement(plugin: MissingPluginInfo): string {
  const baseName = extractPluginName(plugin.module);
  return plugin.requiredVersion
    ? `${baseName}@${plugin.requiredVersion}`
    : baseName;
}

export function formatPluginName(plugin: MissingPluginInfo): string {
  return extractPluginName(plugin.module);
}

export function formatPluginMismatch(plugin: MissingPluginInfo): string {
  const baseName = extractPluginName(plugin.module);
  const installed = plugin.installedVersion
    ? `v${plugin.installedVersion}`
    : "an unknown version";
  const required = plugin.requiredVersion ?? "an unspecified version";
  return `${baseName}: installed ${installed}, requires ${required}`;
}

export function formatGlobalConfigIssue(plugin: MissingPluginInfo): string {
  const baseName = extractPluginName(plugin.module);
  return plugin.message
    ? `${baseName}: ${plugin.message}`
    : `${baseName}: invalid global settings`;
}

export function formatTemplateSettingsWarning(
  warning: PluginCompatibilityResult["templateSettingsWarnings"][number],
): string {
  return warning.message;
}

export function buildCompatibilitySummary(
  result: PluginCompatibilityResult,
): string {
  const { missing, versionMismatches, invalidGlobalConfig, totalRequired } =
    getCompatibilityBreakdown(result);

  if (totalRequired === 0) {
    return "No plugins required";
  }

  if (result.compatible) {
    return `All ${totalRequired} required plugin(s) are compatible`;
  }

  if (
    missing.length > 0 &&
    versionMismatches.length > 0 &&
    invalidGlobalConfig.length > 0
  ) {
    return `Missing plugins (${missing.length}), version mismatches (${versionMismatches.length}), and invalid global settings (${invalidGlobalConfig.length})`;
  }

  if (missing.length > 0 && versionMismatches.length > 0) {
    return `Missing plugins (${missing.length}) and version mismatches (${versionMismatches.length})`;
  }

  if (missing.length > 0 && invalidGlobalConfig.length > 0) {
    return `Missing plugins (${missing.length}) and invalid global settings (${invalidGlobalConfig.length})`;
  }

  if (versionMismatches.length > 0 && invalidGlobalConfig.length > 0) {
    return `Version mismatches (${versionMismatches.length}) and invalid global settings (${invalidGlobalConfig.length})`;
  }

  if (missing.length > 0) {
    return `Missing plugins (${missing.length})`;
  }

  if (invalidGlobalConfig.length > 0) {
    return `Invalid global settings (${invalidGlobalConfig.length})`;
  }

  return `Version mismatches (${versionMismatches.length})`;
}

export function buildWebInstallInstructions(
  specs: string[],
): { docker: string; nix: string } | null {
  if (specs.length === 0) {
    return null;
  }

  const docker = `SKAFF_PLUGINS="${specs.join(" ")}"`;
  const nix = `plugins = [ ${specs.map((spec) => `"${spec}"`).join(" ")} ]`;
  return { docker, nix };
}
