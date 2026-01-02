#!/usr/bin/env bun
/**
 * Build-time Plugin Registry Generator
 *
 * This script scans installed npm packages for Skaff web plugins and generates
 * a static TypeScript registry file that can be imported at runtime.
 *
 * This ensures:
 * 1. Plugins are bundled at build time (no dynamic imports)
 * 2. Only explicitly installed plugins are available
 * 3. Full tree-shaking and minification of plugin code
 * 4. CSP-compliant (no eval or dynamic code loading)
 *
 * Usage:
 *   bun run scripts/generate-plugin-registry.ts
 *
 * The script reads from:
 *   - package.json dependencies
 *   - SKAFF_PLUGINS environment variable (space-separated list)
 *
 * And generates:
 *   - src/lib/plugins/generated-plugin-registry.ts
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import process from "node:process";
import {
  determinePluginTrustBasic,
  type PluginTrustLevel,
  parsePackageSpec,
} from "@timonteutelink/skaff-lib";

const require = createRequire(import.meta.url);

interface PluginManifest {
  name: string;
  version: string;
  capabilities: ("template" | "cli" | "web")[];
  supportedHooks?: {
    template?: string[];
    cli?: string[];
    web?: string[];
  };
  schemas?: {
    globalConfig?: boolean;
    input?: boolean;
    output?: boolean;
  };
}

interface PluginPackageJson {
  name: string;
  version: string;
  main?: string;
  exports?: Record<string, string> | string;
  skaff?: {
    plugin?: boolean;
    bundle?: {
      cli?: string;
      web?: string;
    };
  };
}

interface DiscoveredPlugin {
  packageName: string;
  version: string;
  importPath: string;
  modulePath: string;
  manifestName?: string;
  trustLevel: PluginTrustLevel;
}

const WEB_ROOT = resolve(dirname(import.meta.url.replace("file://", "")), "..");
const OUTPUT_DIR = resolve(WEB_ROOT, "src/lib/plugins");
const OUTPUT_FILE = resolve(OUTPUT_DIR, "generated-plugin-registry.ts");
const MANIFEST_FILE = resolve(WEB_ROOT, "public/plugin-manifest.json");

/**
 * Attempts to load and validate a plugin module to check if it's a valid Skaff plugin
 */
async function validatePlugin(
  packageName: string,
): Promise<{ valid: boolean; manifest?: PluginManifest }> {
  try {
    // Try to require the package to get its exports
    const modulePath = require.resolve(packageName, { paths: [WEB_ROOT] });
    const module = await import(modulePath);

    const pluginModule = module.default ?? module;

    // Check if it has a manifest with web capability
    if (
      pluginModule?.manifest?.name &&
      pluginModule?.manifest?.version &&
      Array.isArray(pluginModule?.manifest?.capabilities)
    ) {
      const manifest = pluginModule.manifest as PluginManifest;
      if (manifest.capabilities.includes("web")) {
        return { valid: true, manifest };
      }
    }

    return { valid: false };
  } catch {
    return { valid: false };
  }
}

/**
 * Gets the package.json of an installed package
 */
function getPackageJson(packageName: string): PluginPackageJson | null {
  try {
    const pkgPath = require.resolve(`${packageName}/package.json`, {
      paths: [WEB_ROOT],
    });
    const content = readFileSync(pkgPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Discovers plugins from environment variable
 */
function getPluginsFromEnv(): string[] {
  const envPlugins = process.env.SKAFF_PLUGINS ?? "";
  return envPlugins
    .split(/\s+/)
    .map((p: string) => p.trim())
    .filter(Boolean)
    .map((spec: string) => parsePackageSpec(spec).name);
}

/**
 * Discovers plugins from package.json dependencies
 * Only considers packages with "skaff-plugin" or "@skaff/" in the name
 */
function getPluginsFromPackageJson(): string[] {
  try {
    const pkgPath = resolve(WEB_ROOT, "package.json");
    const content = readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(content);

    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    return Object.keys(deps);
  } catch {
    return [];
  }
}

function expandWebBundles(packageNames: string[]): string[] {
  const expanded = new Set<string>(packageNames);

  for (const packageName of packageNames) {
    const pkgJson = getPackageJson(packageName);
    const bundledWeb = pkgJson?.skaff?.bundle?.web;
    if (bundledWeb) {
      expanded.add(parsePackageSpec(bundledWeb).name);
    }
  }

  return [...expanded];
}

/**
 * Main function to discover and validate plugins
 */
async function discoverPlugins(): Promise<DiscoveredPlugin[]> {
  const envPlugins = getPluginsFromEnv();
  const pkgPlugins = getPluginsFromPackageJson();

  // Combine and deduplicate
  const allPackages = expandWebBundles([
    ...new Set([...envPlugins, ...pkgPlugins]),
  ]);

  console.log(`Scanning ${allPackages.length} potential plugin packages...`);

  const discovered: DiscoveredPlugin[] = [];

  for (const packageName of allPackages) {
    console.log(`  Checking: ${packageName}`);

    const pkgJson = getPackageJson(packageName);
    if (!pkgJson) {
      console.log(`    Skipped: Could not read package.json`);
      continue;
    }

    const validation = await validatePlugin(packageName);
    if (!validation.valid || !validation.manifest) {
      console.log(`    Skipped: Not a valid Skaff web plugin`);
      continue;
    }

    console.log(
      `    Found: ${validation.manifest.name} v${validation.manifest.version}`,
    );

    const trustLevel = determinePluginTrustBasic(packageName);
    console.log(`    Trust: ${trustLevel}`);

    const modulePath = require.resolve(packageName, { paths: [WEB_ROOT] });

    discovered.push({
      packageName,
      version: pkgJson.version,
      importPath: packageName,
      modulePath,
      manifestName: validation.manifest.name,
      trustLevel,
    });
  }

  return discovered;
}

/**
 * Generates the static TypeScript registry file
 */
function generateRegistryFile(plugins: DiscoveredPlugin[]): string {
  const imports = plugins
    .map((p, i) => `import * as plugin${i} from "${p.importPath}";`)
    .join("\n");

  const registryEntries = plugins
    .map(
      (p, i) =>
        `  "${p.manifestName ?? p.packageName}": {
    module: plugin${i},
    packageName: "${p.packageName}",
    modulePath: "${p.modulePath}",
    version: "${p.version}",
    trustLevel: "${p.trustLevel}",
  }`,
    )
    .join(",\n");

  const manifestEntries = plugins
    .map(
      (p) =>
        `  {
    name: "${p.manifestName ?? p.packageName}",
    packageName: "${p.packageName}",
    version: "${p.version}",
    trustLevel: "${p.trustLevel}",
  }`,
    )
    .join(",\n");

  return `/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 *
 * This file is generated at build time by scripts/generate-plugin-registry.ts
 * It contains static imports for all installed Skaff web plugins.
 *
 * To add or remove plugins, modify the SKAFF_PLUGINS build argument or
 * update package.json dependencies, then rebuild.
 *
 * Generated: ${new Date().toISOString()}
 */

import type { PluginTrustLevel } from "@timonteutelink/skaff-lib";

${imports}

export interface InstalledPluginEntry {
  module: Record<string, unknown>;
  packageName: string;
  modulePath: string;
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
export const INSTALLED_PLUGINS: Record<string, InstalledPluginEntry> = {
${registryEntries}
};

/**
 * List of installed plugin metadata for display purposes.
 */
export const PLUGIN_MANIFEST: PluginManifestEntry[] = [
${manifestEntries}
];

/**
 * Get a plugin by its manifest name.
 */
export function getInstalledPlugin(name: string): Record<string, unknown> | null {
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
`;
}

/**
 * Generates the public manifest JSON file
 */
function generateManifestJson(plugins: DiscoveredPlugin[]): string {
  const manifest = plugins.map((p) => ({
    name: p.manifestName ?? p.packageName,
    packageName: p.packageName,
    version: p.version,
    trustLevel: p.trustLevel,
  }));

  return JSON.stringify(manifest, null, 2);
}

/**
 * Main entry point
 */
async function main() {
  console.log("=".repeat(60));
  console.log("Skaff Web Plugin Registry Generator");
  console.log("=".repeat(60));

  const plugins = await discoverPlugins();

  console.log(`\nDiscovered ${plugins.length} web plugin(s)`);

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Generate TypeScript registry
  const registryContent = generateRegistryFile(plugins);
  writeFileSync(OUTPUT_FILE, registryContent, "utf-8");
  console.log(`\nGenerated: ${OUTPUT_FILE}`);

  // Generate public manifest JSON
  const publicDir = resolve(WEB_ROOT, "public");
  if (!existsSync(publicDir)) {
    mkdirSync(publicDir, { recursive: true });
  }
  const manifestContent = generateManifestJson(plugins);
  writeFileSync(MANIFEST_FILE, manifestContent, "utf-8");
  console.log(`Generated: ${MANIFEST_FILE}`);

  // Summary
  if (plugins.length > 0) {
    console.log("\nInstalled plugins:");
    for (const p of plugins) {
      console.log(`  - ${p.manifestName ?? p.packageName}@${p.version}`);
    }
  } else {
    console.log(
      "\nNo plugins installed. The web app will run without plugins.",
    );
  }

  console.log("\n" + "=".repeat(60));
  console.log("Plugin registry generation complete!");
  console.log("=".repeat(60));
}

main().catch((error) => {
  console.error("Failed to generate plugin registry:", error);
  process.exit(1);
});
