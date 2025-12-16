/**
 * CLI Plugin Manager
 *
 * Handles plugin discovery, validation, and compatibility checking for the Skaff CLI.
 * Works with oclif's plugin system to manage Skaff plugins.
 */

import {Config} from '@oclif/core'
import {
  checkTemplatePluginCompatibility,
  extractPluginName,
  type InstalledPluginInfo,
  type PluginTrustLevel,
  type SinglePluginCompatibilityResult,
  type TemplatePluginCompatibilityResult,
  determinePluginTrust,
  getTrustBadge,
  isOfficialPlugin,
} from '@timonteutelink/skaff-lib'
import type {TemplatePluginConfig} from '@timonteutelink/template-types-lib'

/**
 * Skaff plugin metadata extracted from an oclif plugin.
 */
export interface SkaffCliPluginInfo {
  /** Plugin name from package.json or manifest */
  name: string
  /** Package version */
  version: string
  /** npm package name */
  packageName: string
  /** Whether this is a Skaff plugin (has skaff capabilities) */
  isSkaffPlugin: boolean
  /** Plugin capabilities if it's a Skaff plugin */
  capabilities?: ('template' | 'cli' | 'web')[]
  /** Installation type */
  type: 'user' | 'core' | 'link' | 'dev'
  /** Trust level of the plugin */
  trustLevel: PluginTrustLevel
}

/**
 * Result of validating a plugin package name.
 */
export interface PluginValidationResult {
  valid: boolean
  packageName: string
  reason?: string
  isOfficial?: boolean
}

/**
 * Official Skaff plugin scopes that are trusted.
 */
export const OFFICIAL_PLUGIN_SCOPES = ['@skaff', '@timonteutelink'] as const

/**
 * Validates that a package name is acceptable for installation.
 * Only npm packages from allowed scopes or standard plugin naming conventions are accepted.
 */
export function validatePluginPackage(packageSpec: string): PluginValidationResult {
  // Extract package name from spec (remove version if present)
  const packageName = extractPluginName(packageSpec)

  // Check for valid npm package name format
  const npmNameRegex = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
  if (!npmNameRegex.test(packageName)) {
    return {
      valid: false,
      packageName,
      reason: `Invalid npm package name: "${packageName}"`,
    }
  }

  // Check if it's from an official scope
  const isOfficial = isOfficialPlugin(packageName)

  // Check if it follows plugin naming convention
  const isPluginNamed =
    packageName.includes('skaff-plugin') || packageName.includes('plugin-') || packageName.startsWith('@skaff/')

  if (!isOfficial && !isPluginNamed) {
    return {
      valid: true,
      packageName,
      isOfficial: false,
      reason:
        'Warning: This package does not follow Skaff plugin naming conventions. ' +
        'Ensure it is a legitimate Skaff plugin before installing.',
    }
  }

  return {
    valid: true,
    packageName,
    isOfficial,
  }
}

/**
 * Determines the trust level for a CLI plugin.
 * Note: For now, we do basic scope-based checking. Provenance checking
 * can be enabled for more thorough verification.
 */
export function getCliPluginTrustLevel(packageName: string): PluginTrustLevel {
  const trust = determinePluginTrust(packageName, {})
  return trust.level
}

/**
 * Gets all installed oclif plugins and extracts Skaff plugin information.
 */
export async function getInstalledCliPlugins(config: Config): Promise<SkaffCliPluginInfo[]> {
  const plugins: SkaffCliPluginInfo[] = []

  for (const plugin of config.getPluginsList()) {
    // Skip core oclif plugins
    if (plugin.name.startsWith('@oclif/') || plugin.type === 'core') {
      continue
    }

    // Try to detect if this is a Skaff plugin by checking for manifest
    let isSkaffPlugin = false
    let capabilities: ('template' | 'cli' | 'web')[] | undefined

    try {
      // Try to require the plugin and check for Skaff manifest
      const pluginModule = await import(plugin.name)
      const defaultExport = pluginModule.default ?? pluginModule

      if (defaultExport?.manifest?.capabilities) {
        isSkaffPlugin = true
        capabilities = defaultExport.manifest.capabilities
      }
    } catch {
      // Plugin doesn't have a loadable Skaff manifest - that's ok
    }

    // Determine trust level
    const trustLevel = getCliPluginTrustLevel(plugin.name)

    plugins.push({
      name: plugin.name,
      version: plugin.version,
      packageName: plugin.name,
      isSkaffPlugin,
      capabilities,
      type: plugin.type as 'user' | 'core' | 'link' | 'dev',
      trustLevel,
    })
  }

  return plugins
}

/**
 * Gets only Skaff-specific plugins (those with manifest.capabilities).
 */
export async function getInstalledSkaffPlugins(config: Config): Promise<SkaffCliPluginInfo[]> {
  const allPlugins = await getInstalledCliPlugins(config)
  return allPlugins.filter((p) => p.isSkaffPlugin)
}

/**
 * Builds an InstalledPluginInfo map from oclif plugins for compatibility checking.
 */
export async function buildInstalledPluginsMap(config: Config): Promise<Map<string, InstalledPluginInfo>> {
  const plugins = await getInstalledSkaffPlugins(config)
  const map = new Map<string, InstalledPluginInfo>()

  for (const plugin of plugins) {
    const info: InstalledPluginInfo = {
      name: plugin.name,
      version: plugin.version,
      packageName: plugin.packageName,
    }

    map.set(plugin.name, info)
    if (plugin.packageName !== plugin.name) {
      map.set(plugin.packageName, info)
    }
  }

  return map
}

/**
 * Checks if all plugins required by a template are installed and compatible.
 */
export async function checkTemplatePluginsCompatibility(
  config: Config,
  templatePlugins: TemplatePluginConfig[] | undefined | null,
): Promise<TemplatePluginCompatibilityResult> {
  const installedMap = await buildInstalledPluginsMap(config)
  return checkTemplatePluginCompatibility(templatePlugins, installedMap)
}

/**
 * Formats a compatibility result for CLI output.
 */
export function formatPluginCompatibilityForCli(result: TemplatePluginCompatibilityResult): string {
  if (result.allCompatible) {
    if (result.plugins.length === 0) {
      return 'No plugins required by this template.'
    }
    return `All ${result.plugins.length} required plugin(s) are installed and compatible.`
  }

  const lines: string[] = []

  if (result.missing.length > 0) {
    lines.push('\nMissing plugins:')
    for (const p of result.missing) {
      const version = p.requiredVersion ? `@${p.requiredVersion}` : ''
      lines.push(`  - ${extractPluginName(p.module)}${version}`)
    }
    lines.push('')
    lines.push('Install missing plugins with:')
    lines.push(
      `  skaff plugins install ${result.missing.map((p: SinglePluginCompatibilityResult) => p.module).join(' ')}`,
    )
  }

  if (result.versionMismatches.length > 0) {
    lines.push('\nVersion mismatches:')
    for (const p of result.versionMismatches) {
      lines.push(`  - ${extractPluginName(p.module)}: installed v${p.installedVersion}, requires ${p.requiredVersion}`)
    }
    lines.push('')
    lines.push('Update plugins with:')
    lines.push(
      `  skaff plugins update ${result.versionMismatches.map((p: SinglePluginCompatibilityResult) => extractPluginName(p.module)).join(' ')}`,
    )
  }

  return lines.join('\n')
}

/**
 * Determines related plugins that should be installed together.
 *
 * Plugin naming convention:
 * - @scope/plugin-name (lib/core)
 * - @scope/plugin-name-cli (cli contribution)
 * - @scope/plugin-name-web (web contribution)
 * - @scope/plugin-name-types (type definitions)
 *
 * When installing a -cli or -web plugin, we should also ensure the base lib plugin is installed.
 */
export function getRelatedPluginPackages(packageName: string): {
  base: string
  cli?: string
  web?: string
  types?: string
} {
  const name = extractPluginName(packageName)

  // Determine the base name by removing -cli, -web, -types suffixes
  let baseName = name
  if (name.endsWith('-cli')) {
    baseName = name.slice(0, -4)
  } else if (name.endsWith('-web')) {
    baseName = name.slice(0, -4)
  } else if (name.endsWith('-types')) {
    baseName = name.slice(0, -6)
  }

  return {
    base: baseName,
    cli: `${baseName}-cli`,
    web: `${baseName}-web`,
    types: `${baseName}-types`,
  }
}

/**
 * Checks if a plugin is a CLI variant and returns the base lib package if so.
 */
export function getRequiredLibPlugin(packageName: string): string | null {
  const name = extractPluginName(packageName)

  if (name.endsWith('-cli') || name.endsWith('-web')) {
    // This is a CLI or web plugin - it requires the base lib plugin
    const baseName = name.endsWith('-cli') ? name.slice(0, -4) : name.slice(0, -4)
    return baseName
  }

  return null
}
