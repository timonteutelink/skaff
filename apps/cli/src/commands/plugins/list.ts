import {Flags} from '@oclif/core'

import Base from '../../base-command.js'
import {getInstalledCliPlugins, getInstalledSkaffPlugins, OFFICIAL_PLUGIN_SCOPES} from '../../utils/plugin-manager.js'

export default class PluginsList extends Base {
  static description = 'List installed Skaff plugins'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --all',
    '<%= config.bin %> <%= command.id %> --format json',
  ]

  static flags = {
    ...Base.flags,
    all: Flags.boolean({
      char: 'a',
      description: 'Show all installed oclif plugins, not just Skaff plugins',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PluginsList)

    const plugins = flags.all ? await getInstalledCliPlugins(this.config) : await getInstalledSkaffPlugins(this.config)

    if (plugins.length === 0) {
      if (flags.all) {
        this.log('No plugins installed.')
      } else {
        this.log('No Skaff plugins installed.')
        this.log('Use "skaff plugins install <plugin>" to install plugins.')
      }

      return
    }

    // Prepare output data
    const outputData = plugins.map((plugin) => {
      const isOfficial = OFFICIAL_PLUGIN_SCOPES.some((scope) => plugin.name.startsWith(`${scope}/`))

      return {
        name: plugin.name,
        version: plugin.version,
        type: plugin.type,
        official: isOfficial ? 'yes' : 'no',
        capabilities: plugin.capabilities?.join(', ') ?? '',
      }
    })

    await this.output(outputData)
  }
}
