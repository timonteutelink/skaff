import {Flags} from '@oclif/core'
import {determinePluginTrust, extractPluginName, getTrustBadge} from '@timonteutelink/skaff-lib'

import Base from '../../base-command.js'
import {getCurrentProject} from '../../utils/cli-utils.js'
import {checkTemplatePluginsCompatibility, formatPluginCompatibilityForCli} from '../../utils/plugin-manager.js'

export default class PluginsCheck extends Base {
  static description = 'Check if required plugins for the current project are installed'

  static examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --strict']

  static flags = {
    ...Base.flags,
    strict: Flags.boolean({
      char: 's',
      description: 'Exit with error code if plugins are missing or incompatible',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PluginsCheck)

    // Get current project
    const projectResult = await getCurrentProject(flags.project)

    if ('error' in projectResult) {
      this.error(projectResult.error, {exit: 1})
    }

    if (!projectResult.data) {
      this.error('No project found in the current directory', {exit: 1})
    }

    const project = projectResult.data

    // Get plugins required by the template
    const templatePlugins = project.rootTemplate.config.plugins

    if (!templatePlugins || templatePlugins.length === 0) {
      this.log('This project/template does not require any plugins.')
      return
    }

    this.log(`Checking plugin compatibility for project: ${project.instantiatedProjectSettings.projectRepositoryName}`)
    this.log(`Template: ${project.rootTemplate.config.templateConfig.name}`)
    this.log('')

    // Check compatibility
    const result = await checkTemplatePluginsCompatibility(this.config, templatePlugins)

    if (result.allCompatible) {
      this.log(`All ${result.plugins.length} required plugin(s) are installed and compatible.`)
      this.log('')

      // Show plugin details with trust badges
      let hasUntrustedPlugins = false
      for (const plugin of result.plugins) {
        const packageName = extractPluginName(plugin.module)
        const trust = determinePluginTrust(packageName, {})
        const badge = getTrustBadge(trust.level)
        this.log(`  ${plugin.module}@${plugin.installedVersion} ${badge}`)

        if (trust.level !== 'official' && trust.level !== 'verified') {
          hasUntrustedPlugins = true
        }
      }

      // Show trust warnings if applicable
      if (hasUntrustedPlugins) {
        this.log('')
        this.warn(
          'Some plugins are not from official scopes or lack provenance verification. ' +
            'Review the source code before trusting them with your projects.',
        )
      }

      return
    }

    // Show detailed compatibility issues
    this.log(formatPluginCompatibilityForCli(result))

    if (flags.strict) {
      this.error('Plugin compatibility check failed', {exit: 1})
    }
  }
}
