import {Args, Flags} from '@oclif/core'
import {extractPluginName} from '@timonteutelink/skaff-lib'

import Base from '../../base-command.js'
import {getRequiredLibPlugin, OFFICIAL_PLUGIN_SCOPES, validatePluginPackage} from '../../utils/plugin-manager.js'

export default class PluginsInstall extends Base {
  static description = 'Install a Skaff plugin from npm registry'

  static examples = [
    '<%= config.bin %> <%= command.id %> @skaff/plugin-docker',
    '<%= config.bin %> <%= command.id %> @skaff/plugin-greeter @skaff/plugin-docker',
    '<%= config.bin %> <%= command.id %> @skaff/plugin-docker@1.2.0',
    '<%= config.bin %> <%= command.id %> @skaff/plugin-docker-cli --with-deps',
  ]

  static flags = {
    ...Base.flags,
    force: Flags.boolean({
      char: 'F',
      description: 'Force install without validation warnings',
      default: false,
    }),
    'with-deps': Flags.boolean({
      char: 'd',
      description: 'Automatically install base lib plugin when installing -cli or -web variants',
      default: true,
    }),
  }

  static args = {
    plugins: Args.string({
      description: 'Plugin package(s) to install (npm package names)',
      required: true,
    }),
  }

  static strict = false // Allow multiple plugin arguments

  async run(): Promise<void> {
    const {argv, flags} = await this.parse(PluginsInstall)

    if (!argv || argv.length === 0) {
      this.error('Please specify at least one plugin to install', {exit: 1})
    }

    const pluginsToInstall: string[] = []
    const warnings: string[] = []

    // Validate all plugins first
    for (const pluginSpec of argv as string[]) {
      const validation = validatePluginPackage(pluginSpec)

      if (!validation.valid) {
        this.error(validation.reason ?? `Invalid plugin package: ${pluginSpec}`, {exit: 1})
      }

      if (validation.reason && !flags.force) {
        warnings.push(validation.reason)
      }

      pluginsToInstall.push(pluginSpec)

      // Check if we need to install the base lib plugin
      if (flags['with-deps']) {
        const requiredLib = getRequiredLibPlugin(validation.packageName)
        if (requiredLib && !pluginsToInstall.includes(requiredLib)) {
          this.log(`Plugin ${extractPluginName(pluginSpec)} requires base plugin: ${requiredLib}`)
          pluginsToInstall.unshift(requiredLib) // Install base first
        }
      }
    }

    // Show warnings
    if (warnings.length > 0 && !flags.force) {
      this.log('')
      this.warn('Warnings:')
      for (const warning of warnings) {
        this.log(`  - ${warning}`)
      }
      this.log('')
      this.log('Use --force to skip these warnings.')
      this.log('')
    }

    // Show official scope info
    const officialPlugins = pluginsToInstall.filter((p) =>
      OFFICIAL_PLUGIN_SCOPES.some((scope) => extractPluginName(p).startsWith(`${scope}/`)),
    )
    const thirdPartyPlugins = pluginsToInstall.filter(
      (p) => !OFFICIAL_PLUGIN_SCOPES.some((scope) => extractPluginName(p).startsWith(`${scope}/`)),
    )

    if (officialPlugins.length > 0) {
      this.log(`Installing ${officialPlugins.length} official plugin(s)...`)
    }

    if (thirdPartyPlugins.length > 0) {
      this.log(`Installing ${thirdPartyPlugins.length} third-party plugin(s)...`)
      if (!flags.force) {
        this.warn(
          'Third-party plugins are not verified by the Skaff team. ' +
            'Ensure you trust the plugin author before proceeding.',
        )
      }
    }

    // Install plugins using oclif's plugin system
    for (const plugin of pluginsToInstall) {
      this.log(`\nInstalling ${plugin}...`)
      try {
        // Use oclif's built-in plugins:install command
        await this.config.runCommand('plugins:install', [plugin])
        this.log(`Successfully installed ${extractPluginName(plugin)}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.error(`Failed to install ${plugin}: ${message}`, {exit: 1})
      }
    }

    this.log('\nPlugin installation complete!')
    this.log('Use "skaff plugins list" to see installed plugins.')
  }
}
