import {Args} from '@oclif/core'
import {removePluginSystemSettings} from '@timonteutelink/skaff-lib'

import Base from '../../base-command.js'
import {getPluginNameValidationError} from '../../utils/plugin-settings.js'

export default class PluginSettingsRemove extends Base {
  static description = 'Remove system-wide settings for a plugin'

  static examples = [
    '<%= config.bin %> <%= command.id %> @skaff/plugin-greeter',
  ]

  static args = {
    pluginName: Args.string({
      description: 'The plugin name to remove settings for',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(PluginSettingsRemove)

    const validationError = getPluginNameValidationError(args.pluginName)
    if (validationError) {
      this.error(validationError, {exit: 1})
    }

    await removePluginSystemSettings(args.pluginName)
    this.log(`Removed plugin settings for ${args.pluginName}.`)
  }
}
