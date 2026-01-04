/**
 * CLI Plugin Manager
 *
 * Handles plugin discovery, validation, and compatibility checking for the Skaff CLI.
 * Works with oclif's plugin system to manage Skaff plugins.
 */

import {Config} from '@oclif/core'
import {createRequire} from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import * as skaffLib from '@timonteutelink/skaff-lib'
import type {
  InstalledPluginInfo,
  PluginTrustLevel,
  SinglePluginCompatibilityResult,
  TemplateSettingsWarning,
  TemplatePluginCompatibilityResult,
} from '@timonteutelink/skaff-lib'
import type {TemplatePluginConfig, UserTemplateSettings} from '@timonteutelink/template-types-lib'
import {z} from 'zod'

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

export interface PluginBundleMetadata {
  cli?: string
  web?: string
}

export function parsePluginBundleMetadata(packageJson: unknown): PluginBundleMetadata | null {
  if (!packageJson || typeof packageJson !== 'object') {
    return null
  }

  const bundle = (packageJson as {skaff?: {bundle?: unknown}}).skaff?.bundle
  if (!bundle || typeof bundle !== 'object') {
    return null
  }

  const cli = typeof (bundle as {cli?: unknown}).cli === 'string' ? (bundle as {cli: string}).cli : undefined
  const web = typeof (bundle as {web?: unknown}).web === 'string' ? (bundle as {web: string}).web : undefined

  if (!cli && !web) {
    return null
  }

  return {cli, web}
}

async function getDataDirDependencyNames(config: Config): Promise<string[]> {
  try {
    const packagePath = path.join(config.dataDir, 'package.json')
    const raw = await fs.readFile(packagePath, 'utf8')
    const data = JSON.parse(raw) as {dependencies?: Record<string, string>}
    return Object.keys(data.dependencies ?? {})
  } catch {
    return []
  }
}

export async function getInstalledPluginBundleMetadata(
  config: Config,
  packageName: string,
): Promise<PluginBundleMetadata | null> {
  try {
    const requireFromDataDir = createRequire(path.join(config.dataDir, 'package.json'))
    const pkgPath = requireFromDataDir.resolve(`${packageName}/package.json`)
    const raw = await fs.readFile(pkgPath, 'utf8')
    const packageJson = JSON.parse(raw) as unknown
    return parsePluginBundleMetadata(packageJson)
  } catch {
    return null
  }
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
  const {name: packageName} = skaffLib.parsePackageSpec(packageSpec)

  const isFileOrUrl =
    packageSpec.startsWith('file:') ||
    packageSpec.startsWith('http://') ||
    packageSpec.startsWith('https://') ||
    packageSpec.startsWith('git+')
  if (isFileOrUrl) {
    return {
      valid: true,
      packageName,
      isOfficial: false,
    }
  }

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
  const isOfficial = skaffLib.isOfficialPlugin(packageName)

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
  const trust = skaffLib.determinePluginTrust(packageName, {})
  return trust.level
}

/**
 * Gets all installed oclif plugins and extracts Skaff plugin information.
 */
export async function getInstalledCliPlugins(config: Config): Promise<SkaffCliPluginInfo[]> {
  const plugins: SkaffCliPluginInfo[] = []
  const seenPackages = new Set<string>()

  for (const plugin of config.getPluginsList()) {
    // Skip core oclif plugins
    if (plugin.name.startsWith('@oclif/') || plugin.type === 'core') {
      continue
    }

    // Try to detect if this is a Skaff plugin by checking for manifest
    let isSkaffPlugin = false
    let capabilities: ('template' | 'cli' | 'web')[] | undefined

    try {
      const requireFromPlugin = createRequire(path.join(plugin.root, 'package.json'))
      const modulePath = requireFromPlugin.resolve(plugin.name)
      const pluginModule = await import(pathToFileURL(modulePath).href)
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
    seenPackages.add(plugin.name)
  }

  const dependencyNames = await getDataDirDependencyNames(config)
  if (dependencyNames.length > 0) {
    const requireFromDataDir = createRequire(path.join(config.dataDir, 'package.json'))

    for (const dependencyName of dependencyNames) {
      if (seenPackages.has(dependencyName)) {
        continue
      }

      try {
        const modulePath = requireFromDataDir.resolve(dependencyName)
        const packageJsonPath = path.join(path.dirname(modulePath), '..', 'package.json')
        const packageRaw = await fs.readFile(packageJsonPath, 'utf8')
        const packageInfo = JSON.parse(packageRaw) as {name?: string; version?: string}
        const pluginModule = await import(pathToFileURL(modulePath).href)
        const defaultExport = pluginModule.default ?? pluginModule

        const isSkaffPlugin = Boolean(defaultExport?.manifest?.capabilities)
        const capabilities = isSkaffPlugin ? defaultExport.manifest.capabilities : undefined
        const packageName = packageInfo.name ?? dependencyName

        plugins.push({
          name: packageName,
          version: packageInfo.version ?? 'unknown',
          packageName,
          isSkaffPlugin,
          capabilities,
          type: 'user',
          trustLevel: getCliPluginTrustLevel(packageName),
        })
        seenPackages.add(packageName)
      } catch {
        // Ignore non-plugin dependencies
      }
    }
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
 * Registers installed Skaff plugin modules so they can be activated by templates.
 */
export async function registerInstalledPluginModules(config: Config): Promise<void> {
  const entries: { moduleExports: unknown; modulePath: string; packageName: string }[] = []
  const seenPackages = new Set<string>()

  for (const plugin of config.getPluginsList()) {
    if (plugin.name.startsWith('@oclif/') || plugin.type === 'core') {
      continue
    }

    try {
      const requireFromPlugin = createRequire(path.join(plugin.root, 'package.json'))
      const modulePath = requireFromPlugin.resolve(plugin.name)
      const moduleNamespace = await import(pathToFileURL(modulePath).href)
      const candidate = moduleNamespace.default ?? moduleNamespace
      if (!candidate?.manifest?.capabilities) {
        continue
      }

      entries.push({
        moduleExports: moduleNamespace,
        modulePath,
        packageName: plugin.name,
      })
      seenPackages.add(plugin.name)
    } catch {
      // Ignore plugins that fail to import; they are treated as not installed
    }
  }

  const dependencyNames = await getDataDirDependencyNames(config)
  if (dependencyNames.length > 0) {
    const requireFromDataDir = createRequire(path.join(config.dataDir, 'package.json'))

    for (const dependencyName of dependencyNames) {
      if (seenPackages.has(dependencyName)) {
        continue
      }

      try {
        const modulePath = requireFromDataDir.resolve(dependencyName)
        const moduleNamespace = await import(pathToFileURL(modulePath).href)
        const candidate = moduleNamespace.default ?? moduleNamespace
        if (!candidate?.manifest?.capabilities) {
          continue
        }

        entries.push({
          moduleExports: moduleNamespace,
          modulePath,
          packageName: dependencyName,
        })
        seenPackages.add(dependencyName)
      } catch {
        // Ignore non-plugin dependencies
      }
    }
  }

  if (entries.length > 0) {
    skaffLib.registerPluginModules(entries)
  }
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
  templateSettingsSchema?: z.ZodObject<UserTemplateSettings>,
): Promise<TemplatePluginCompatibilityResult> {
  const installedMap = await buildInstalledPluginsMap(config)
  const baseResult = skaffLib.checkTemplatePluginCompatibility(templatePlugins, installedMap)
  const normalized = skaffLib.normalizeTemplatePlugins(templatePlugins)

  if (!normalized.length) {
    return baseResult
  }

  const pluginSettings = await skaffLib.getAllPluginSystemSettings()
  const updatedEntries = await Promise.all(
    baseResult.plugins.map(async (pluginResult) => {
      if (!pluginResult.compatible) {
        return {pluginResult}
      }

      const pluginConfig = normalized.find((entry) => entry.module === pluginResult.module)
      if (!pluginConfig) {
        return {pluginResult}
      }

      const moduleResult = await skaffLib.resolveRegisteredPluginModule(pluginConfig)
      if ('error' in moduleResult) {
        return {
          pluginResult: {
            ...pluginResult,
            compatible: false,
            reason: 'invalid_global_config' as const,
            message: `Unable to load plugin for global settings validation: ${moduleResult.error}`,
          },
        }
      }

      const pluginModule = moduleResult.data
      const pluginName = pluginModule.manifest?.name ?? skaffLib.extractPluginName(pluginConfig.module)
      let updatedPluginResult = pluginResult
      if (pluginModule.globalConfigSchema) {
        const rawSettings = pluginSettings[pluginName]
        const parsed = pluginModule.globalConfigSchema.safeParse(rawSettings ?? {})

        if (!parsed.success) {
          updatedPluginResult = {
            ...pluginResult,
            compatible: false,
            reason: 'invalid_global_config' as const,
            message: `Invalid global config for plugin ${pluginName}: ${parsed.error}`,
          }
        }
      }

      let warning: TemplateSettingsWarning | undefined
      if (templateSettingsSchema && pluginModule.requiredTemplateSettingsSchema) {
        const compatibility = skaffLib.checkTemplateSettingsSchemaCompatibility(
          templateSettingsSchema,
          pluginModule.requiredTemplateSettingsSchema,
        )
        if (!compatibility.compatible) {
          warning = {
            module: pluginConfig.module,
            missingKeys: compatibility.missingKeys,
            optionalKeys: compatibility.optionalKeys,
            message: skaffLib.formatTemplateSettingsSchemaWarning(pluginName, compatibility),
          }
        }
      }

      return {pluginResult: updatedPluginResult, warning}
    }),
  )

  const missing: SinglePluginCompatibilityResult[] = []
  const versionMismatches: SinglePluginCompatibilityResult[] = []
  const invalidGlobalConfig: SinglePluginCompatibilityResult[] = []
  const compatible: SinglePluginCompatibilityResult[] = []
  const templateSettingsWarnings: TemplateSettingsWarning[] = []

  const updatedPlugins = updatedEntries.map((entry) => entry.pluginResult)

  for (const entry of updatedEntries) {
    if (entry.warning) {
      templateSettingsWarnings.push(entry.warning)
    }

    const result = entry.pluginResult
    if (result.compatible) {
      compatible.push(result)
    } else if (result.reason === 'not_installed') {
      missing.push(result)
    } else if (result.reason === 'invalid_global_config') {
      invalidGlobalConfig.push(result)
    } else {
      versionMismatches.push(result)
    }
  }

  return {
    ...baseResult,
    plugins: updatedPlugins,
    missing,
    versionMismatches,
    invalidGlobalConfig,
    compatible,
    allCompatible:
      missing.length === 0 && versionMismatches.length === 0 && invalidGlobalConfig.length === 0,
    templateSettingsWarnings,
  }
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
      lines.push(`  - ${skaffLib.extractPluginName(p.module)}${version}`)
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
      lines.push(
        `  - ${skaffLib.extractPluginName(p.module)}: installed v${p.installedVersion}, requires ${p.requiredVersion}`,
      )
    }
    lines.push('')
    lines.push('Update plugins with:')
    lines.push(
      `  skaff plugins update ${result.versionMismatches.map((p: SinglePluginCompatibilityResult) => skaffLib.extractPluginName(p.module)).join(' ')}`,
    )
  }

  if (result.invalidGlobalConfig.length > 0) {
    lines.push('\nInvalid global plugin settings:')
    for (const p of result.invalidGlobalConfig) {
      lines.push(`  - ${skaffLib.extractPluginName(p.module)}: ${p.message ?? 'invalid global settings'}`)
    }
    lines.push('')
    lines.push('Update plugin settings with:')
    lines.push(
      `  skaff plugin-settings set ${result.invalidGlobalConfig.map((p: SinglePluginCompatibilityResult) => skaffLib.extractPluginName(p.module)).join(' ')}`,
    )
  }

  return lines.join('\n')
}

export function formatTemplateSettingsWarningsForCli(
  warnings: TemplateSettingsWarning[],
): string {
  if (warnings.length === 0) {
    return ''
  }

  const lines = ['Template settings schema warnings:']
  for (const warning of warnings) {
    lines.push(`  - ${warning.message}`)
  }
  return lines.join('\n')
}

/**
 * Determines related plugins that should be installed together.
 *
 * Bundle relationships are declared through skaff.bundle metadata in package.json.
 */
