import {Args} from '@oclif/core'
import {setPluginSystemSettings} from '@timonteutelink/skaff-lib'

import Base from '../../base-command.js'
import {getPluginNameValidationError} from '../../utils/plugin-settings.js'

export default class PluginSettingsSet extends Base {
  static description = 'Save system-wide settings for a plugin'

  static examples = [
    '<%= config.bin %> <%= command.id %> @skaff/plugin-greeter "{\"greeting\": \"Hello\"}"',
    '<%= config.bin %> <%= command.id %> my-plugin "{\"enabled\": true}"',
  ]

  static args = {
    pluginName: Args.string({
      description: 'The plugin name to configure',
      required: true,
    }),
    settings: Args.string({
      description: 'JSON settings to store for the plugin',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(PluginSettingsSet)

    const validationError = getPluginNameValidationError(args.pluginName)
    if (validationError) {
      this.error(validationError, {exit: 1})
    }

    let parsedSettings: unknown
    try {
      parsedSettings = JSON.parse(args.settings)
    } catch {
      this.error('Settings must be valid JSON', {exit: 1})
    }

    await setPluginSystemSettings(args.pluginName, parsedSettings)
    this.log(`Saved plugin settings for ${args.pluginName}.`)
  }
}
