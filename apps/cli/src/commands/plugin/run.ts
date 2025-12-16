import {Flags} from '@oclif/core'
import {loadPluginsForTemplate, resolvePluginCommands, findPluginCommand} from '@timonteutelink/skaff-lib'

import Base from '../../base-command.js'
import {getCurrentProject} from '../../utils/cli-utils.js'

export default class PluginRun extends Base {
  static description = 'List and invoke CLI commands contributed by configured template plugins'

  static flags = {
    ...Base.flags,
    command: Flags.string({
      char: 'c',
      description: 'The plugin command to execute (use full name like "plugin:cmd" or unique alias)',
    }),
    list: Flags.boolean({
      char: 'l',
      description: 'Only list available plugin commands',
      default: false,
    }),
    args: Flags.string({
      description: 'Arguments to forward to the plugin command',
      multiple: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PluginRun)

    const projectResult = await getCurrentProject(flags.project)

    if ('error' in projectResult) {
      this.error(projectResult.error, {exit: 1})
    }

    if (!projectResult.data) {
      this.error('No project found in the current directory', {exit: 1})
    }

    const project = projectResult.data
    const pluginLoadResult = await loadPluginsForTemplate(project.rootTemplate, project.instantiatedProjectSettings)

    if ('error' in pluginLoadResult) {
      this.error(pluginLoadResult.error, {exit: 1})
    }

    // Use the new resolver with collision detection
    let commandEntries
    try {
      commandEntries = resolvePluginCommands(pluginLoadResult.data)
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error), {exit: 1})
    }

    if (!commandEntries.length) {
      this.log('No CLI plugin commands available for this project.')
      return
    }

    if (flags.list || !flags.command) {
      this.output(
        commandEntries.map((entry) => ({
          name: entry.fullName,
          alias: entry.alias ?? '',
          description: entry.command.description ?? '',
        })),
      )
      return
    }

    const selected = findPluginCommand(commandEntries, flags.command)

    if (!selected) {
      this.error(
        `Command "${flags.command}" not found. Available commands:\n${commandEntries
          .map((entry) => `  ${entry.fullName}${entry.alias ? ` (alias: ${entry.alias})` : ''}`)
          .join('\n')}`,
        {exit: 1},
      )
    }

    await selected.command.run({
      argv: flags.args ?? [],
      projectPath: project.absoluteRootDir,
      projectName: project.instantiatedProjectSettings.projectRepositoryName,
      projectAuthor: project.instantiatedProjectSettings.projectAuthor,
      rootTemplateName: project.instantiatedProjectSettings.rootTemplateName,
      templateCount: project.instantiatedProjectSettings.instantiatedTemplates.length,
    })
  }
}
