import {Args} from '@oclif/core'
import {getAllPluginSystemSettings, getPluginSystemSettings} from '@timonteutelink/skaff-lib'

import Base from '../../base-command.js'
import {getPluginNameValidationError} from '../../utils/plugin-settings.js'

export default class PluginSettingsGet extends Base {
  static description = 'Show system-wide settings for installed plugins'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> @skaff/plugin-greeter',
    '<%= config.bin %> <%= command.id %> @skaff/plugin-greeter --format json',
  ]

  static args = {
    pluginName: Args.string({
      description: 'The plugin name to retrieve settings for',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(PluginSettingsGet)

    if (args.pluginName) {
      const validationError = getPluginNameValidationError(args.pluginName)
      if (validationError) {
        this.error(validationError, {exit: 1})
      }

      const settings = await getPluginSystemSettings(args.pluginName)
      if (settings === undefined) {
        this.error(`No system settings found for plugin "${args.pluginName}".`, {exit: 1})
      }

      await this.output({pluginName: args.pluginName, settings})
      return
    }

    const settings = await getAllPluginSystemSettings()
    const entries = Object.entries(settings).map(([pluginName, pluginSettings]) => ({
      pluginName,
      settings: pluginSettings,
    }))

    if (entries.length === 0) {
      this.log('No plugin settings configured.')
      return
    }

    await this.output(entries)
  }
}
