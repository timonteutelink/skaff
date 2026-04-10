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
} from "@timonteutelink/skaff-lib/browser";
import { z } from "zod";

interface ParsedPackageSpec {
  name: string;
  version?: string;
}

function parsePackageSpec(packageSpec: string): ParsedPackageSpec {
  if (packageSpec.startsWith("@")) {
    const parts = packageSpec.split("/");
    if (parts.length >= 2) {
      const scope = parts[0];
      const nameWithVersion = parts.slice(1).join("/");
      const atIndex = nameWithVersion.lastIndexOf("@");
      if (atIndex > 0) {
        return {
          name: `${scope}/${nameWithVersion.slice(0, atIndex)}`,
          version: nameWithVersion.slice(atIndex + 1),
        };
      }
      return { name: packageSpec };
    }
  } else {
    const atIndex = packageSpec.lastIndexOf("@");
    if (atIndex > 0) {
      return {
        name: packageSpec.slice(0, atIndex),
        version: packageSpec.slice(atIndex + 1),
      };
    }
  }

  return { name: packageSpec };
}

const require = createRequire(import.meta.url);

const pluginManifestSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9-_.:@/]+$/, "Plugin names must be identifier-like."),
  version: z
    .string()
    .regex(
      /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z-.]+)?$/,
      "Version must be semver.",
    ),
  capabilities: z.array(z.enum(["template", "cli", "web"])).min(1),
  supportedHooks: z
    .object({
      template: z
        .array(
          z.enum([
            "configureTemplateInstantiationPipeline",
            "configureProjectCreationPipeline",
          ]),
        )
        .default([]),
      cli: z.array(z.string()).default([]),
      web: z.array(z.string()).default([]),
    })
    .default({ template: [], cli: [], web: [] }),
  requiredSettingsKeys: z.array(z.string()).optional(),
});

type PluginManifest = z.infer<typeof pluginManifestSchema>;

interface PluginPackageJson {
  name: string;
  version: string;
  skaff?: {
    bundle?: {
      web?: string;
    };
    manifest?: unknown;
  };
}

interface DiscoveredPlugin {
  packageName: string;
  version: string;
  importPath: string;
  modulePath: string;
  manifestName?: string;
  manifest: PluginManifest;
  trustLevel: PluginTrustLevel;
}

const WEB_ROOT = resolve(dirname(import.meta.url.replace("file://", "")), "..");
const OUTPUT_DIR = resolve(WEB_ROOT, "src/lib/plugins");
const OUTPUT_FILE = resolve(OUTPUT_DIR, "generated-plugin-registry.ts");
const MANIFEST_FILE = resolve(WEB_ROOT, "public/plugin-manifest.json");

/**
 * Gets the package.json of an installed package
 */
function getPackageJson(packageName: string): PluginPackageJson | null {
  try {
    const entryPath = require.resolve(packageName, { paths: [WEB_ROOT] });
    let currentDir = dirname(entryPath);
    let pkgPath: string | null = null;
    while (currentDir && currentDir !== dirname(currentDir)) {
      const candidate = resolve(currentDir, "package.json");
      if (existsSync(candidate)) {
        pkgPath = candidate;
        break;
      }
      currentDir = dirname(currentDir);
    }
    if (!pkgPath) {
      return null;
    }
    const content = readFileSync(pkgPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

const DEV_DEFAULT_PLUGINS = ["@skaff/plugin-greeter"];

function shouldIncludeDevDefaults(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.SKAFF_DEV_PLUGINS === "1" ||
    process.env.SKAFF_DEV_TEMPLATES === "1"
  );
}

/**
 * Discovers plugins from environment variable
 */
function getPluginsFromEnv(): string[] {
  const envPlugins = process.env.SKAFF_PLUGINS ?? "";
  const plugins = envPlugins
    .split(/\s+/)
    .map((p: string) => p.trim())
    .filter(Boolean)
    .map((spec: string) => parsePackageSpec(spec).name);

  if (shouldIncludeDevDefaults()) {
    for (const plugin of DEV_DEFAULT_PLUGINS) {
      plugins.push(plugin);
    }
  }

  return [...new Set(plugins)];
}

function expandBundledPlugins(packageNames: string[]): string[] {
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

  // Combine and deduplicate
  const allPackages = expandBundledPlugins([...new Set(envPlugins)]);

  console.log(`Scanning ${allPackages.length} potential plugin packages...`);

  const discovered: DiscoveredPlugin[] = [];

  for (const packageName of allPackages) {
    console.log(`  Checking: ${packageName}`);

    const pkgJson = getPackageJson(packageName);
    if (!pkgJson) {
      console.log(`    Skipped: Could not read package.json`);
      continue;
    }

    const manifestCandidate = pkgJson.skaff?.manifest;
    const manifestResult = pluginManifestSchema.safeParse(manifestCandidate);
    if (!manifestResult.success) {
      console.log(`    Skipped: Missing or invalid skaff.manifest`);
      continue;
    }

    const manifest = manifestResult.data;
    if (!manifest.capabilities.includes("web")) {
      console.log(`    Skipped: Missing web capability`);
      continue;
    }

    console.log(
      `    Found: ${manifest.name} v${manifest.version}`,
    );

    const trustLevel = determinePluginTrustBasic(packageName);
    console.log(`    Trust: ${trustLevel}`);

    const modulePath = require.resolve(packageName, { paths: [WEB_ROOT] });

    discovered.push({
      packageName,
      version: pkgJson.version,
      importPath: packageName,
      modulePath,
      manifestName: manifest.name,
      manifest,
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
    manifest: ${JSON.stringify(p.manifest, null, 2).replace(/\n/g, "\n    ")},
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
    manifest: ${JSON.stringify(p.manifest, null, 2).replace(/\n/g, "\n    ")},
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
 * To add or remove plugins, modify the SKAFF_PLUGINS build argument, then rebuild.
 *
 * Generated: ${new Date().toISOString()}
 */

import type { PluginManifest, PluginTrustLevel } from "@timonteutelink/skaff-lib";

${imports}

export interface InstalledPluginEntry {
  module: Record<string, unknown>;
  packageName: string;
  modulePath: string;
  version: string;
  manifest: PluginManifest;
  trustLevel: PluginTrustLevel;
}

export interface PluginManifestEntry {
  name: string;
  packageName: string;
  version: string;
  manifest: PluginManifest;
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
    manifest: p.manifest,
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
