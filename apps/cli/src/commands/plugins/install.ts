import {Args, Flags} from '@oclif/core'
import {commands as oclifPluginCommands} from '@oclif/plugin-plugins'
import {
  extractPluginName,
  determinePluginTrust,
  getTrustBadge,
  isOfficialPlugin,
  parsePackageSpec,
} from '@timonteutelink/skaff-lib'
import Base from '../../base-command.js'
import {getInstalledPluginBundleMetadata, validatePluginPackage} from '../../utils/plugin-manager.js'

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
    const queuedPackages = new Set<string>()

    const queuePlugin = (pluginSpec: string) => {
      const packageName = parsePackageSpec(pluginSpec).name
      if (queuedPackages.has(packageName)) {
        return
      }
      queuedPackages.add(packageName)
      pluginsToInstall.push(pluginSpec)
    }

    // Validate all plugins first
    for (const pluginSpec of argv as string[]) {
      const validation = validatePluginPackage(pluginSpec)

      if (!validation.valid) {
        this.error(validation.reason ?? `Invalid plugin package: ${pluginSpec}`, {exit: 1})
      }

      if (validation.reason && !flags.force) {
        warnings.push(validation.reason)
      }

      queuePlugin(pluginSpec)
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

    // Show trust level info for each plugin
    const officialPlugins: string[] = []
    const thirdPartyPlugins: string[] = []

    for (const plugin of pluginsToInstall) {
      const packageName = extractPluginName(plugin)
      const trust = determinePluginTrust(packageName, {})

      if (isOfficialPlugin(packageName)) {
        officialPlugins.push(plugin)
      } else {
        thirdPartyPlugins.push(plugin)
        // Show trust warnings for non-official plugins
        if (!flags.force && trust.warnings.length > 0) {
          this.log(`\n${getTrustBadge(trust.level)} ${packageName}`)
          for (const warning of trust.warnings) {
            this.log(`  - ${warning}`)
          }
        }
      }
    }

    if (officialPlugins.length > 0) {
      this.log(`\nInstalling ${officialPlugins.length} official plugin(s)...`)
    }

    if (thirdPartyPlugins.length > 0) {
      this.log(`Installing ${thirdPartyPlugins.length} third-party plugin(s)...`)
      if (!flags.force) {
        this.warn(
          'Third-party plugins are not verified by the Skaff team. ' +
            'Review the source code before trusting them with your projects.',
        )
      }
    }

    // Install plugins using oclif's plugin system
    const installedPackages = new Set<string>()

    for (let index = 0; index < pluginsToInstall.length; index += 1) {
      const plugin = pluginsToInstall[index]
      const parsed = parsePackageSpec(plugin)
      if (installedPackages.has(parsed.name)) {
        continue
      }

      try {
        this.log(`\nInstalling ${plugin} via oclif...`)
        const PluginsInstall = oclifPluginCommands['plugins:install']
        await PluginsInstall.run([plugin], this.config)
        this.log(`Successfully installed ${extractPluginName(plugin)}`)
        installedPackages.add(parsed.name)

        if (flags['with-deps']) {
          const bundleMetadata = await getInstalledPluginBundleMetadata(this.config, parsed.name)
          if (bundleMetadata?.cli) {
            const bundleName = parsePackageSpec(bundleMetadata.cli).name
            if (!queuedPackages.has(bundleName) && !installedPackages.has(bundleName)) {
              this.log(`Installing bundled CLI plugin: ${bundleMetadata.cli}`)
              pluginsToInstall.push(bundleMetadata.cli)
              queuedPackages.add(bundleName)
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.error(`Failed to install ${plugin}: ${message}`, {exit: 1})
      }
    }

    this.log('\nPlugin installation complete!')
    this.log('Use "skaff plugins list" to see installed plugins.')
  }
}
