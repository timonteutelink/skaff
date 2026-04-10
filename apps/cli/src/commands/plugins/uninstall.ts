import {Args, Flags} from '@oclif/core'
import {extractPluginName} from '@timonteutelink/skaff-lib'

import Base from '../../base-command.js'
import {getInstalledSkaffPlugins} from '../../utils/plugin-manager.js'

export default class PluginsUninstall extends Base {
  static description = 'Uninstall a Skaff plugin'

  static examples = [
    '<%= config.bin %> <%= command.id %> @skaff/plugin-docker',
    '<%= config.bin %> <%= command.id %> @skaff/plugin-greeter @skaff/plugin-docker',
  ]

  static flags = {
    ...Base.flags,
    force: Flags.boolean({
      char: 'F',
      description: 'Force uninstall without confirmation',
      default: false,
    }),
  }

  static args = {
    plugins: Args.string({
      description: 'Plugin package(s) to uninstall',
      required: true,
    }),
  }

  static strict = false // Allow multiple plugin arguments

  async run(): Promise<void> {
    const {argv, flags} = await this.parse(PluginsUninstall)

    if (!argv || argv.length === 0) {
      this.error('Please specify at least one plugin to uninstall', {exit: 1})
    }

    // Get currently installed plugins
    const installedPlugins = await getInstalledSkaffPlugins(this.config)
    const installedNames = new Set(installedPlugins.map((p) => p.name))

    const pluginsToUninstall: string[] = []
    const notInstalled: string[] = []

    for (const pluginSpec of argv as string[]) {
      const pluginName = extractPluginName(pluginSpec)

      if (!installedNames.has(pluginName)) {
        notInstalled.push(pluginName)
      } else {
        pluginsToUninstall.push(pluginName)
      }
    }

    // Warn about plugins not installed
    if (notInstalled.length > 0) {
      this.warn(`The following plugins are not installed: ${notInstalled.join(', ')}`)
    }

    if (pluginsToUninstall.length === 0) {
      this.log('No plugins to uninstall.')
      return
    }

    // Show what will be uninstalled
    this.log(`\nThe following plugin(s) will be uninstalled:`)
    for (const plugin of pluginsToUninstall) {
      const info = installedPlugins.find((p) => p.name === plugin)
      this.log(`  - ${plugin}@${info?.version ?? 'unknown'}`)
    }

    // Uninstall plugins using oclif's plugin system
    for (const plugin of pluginsToUninstall) {
      this.log(`\nUninstalling ${plugin}...`)
      try {
        await this.config.runCommand('plugins:uninstall', [plugin])
        this.log(`Successfully uninstalled ${plugin}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.error(`Failed to uninstall ${plugin}: ${message}`, {exit: 1})
      }
    }

    this.log('\nPlugin uninstallation complete!')
  }
}
