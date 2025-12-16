import {Args, Flags} from '@oclif/core'
import {generateNewProject, getTemplate, loadTemplateFromRepo} from '@timonteutelink/skaff-lib'

import Base from '../../base-command.js'
import {viewParsedDiffWithGit} from '../../utils/diff-utils.js'
import {checkTemplatePluginsCompatibility, formatPluginCompatibilityForCli} from '../../utils/plugin-manager.js'
import {readUserTemplateSettings} from '../../utils/template-utils.js'

export default class InstantiationProjectNew extends Base {
  static args = {
    projectRepositoryName: Args.string({required: true}),
    templateName: Args.string({required: true}),
  }
  static description = 'Create a new project repository from a template'
  static flags = {
    ...Base.flags,
    settings: Flags.string({
      char: 's',
      description: 'Inline JSON or path to JSON file with template settings. If omitted, settings are prompted.',
    }),
    repo: Flags.string({description: 'Git repository URL or path to load before instantiation'}),
    branch: Flags.string({description: 'Branch to checkout when loading repo (optional)'}),
    revision: Flags.string({description: 'Specific commit hash to pin when loading repo (optional)'}),
    'skip-plugin-check': Flags.boolean({
      description: 'Skip plugin compatibility check',
      default: false,
    }),
  }

  async run() {
    const {args, flags} = await this.parse(InstantiationProjectNew)

    if (flags.repo) {
      const branch = (flags.branch as string | undefined)?.trim() || undefined
      const revision = (flags.revision as string | undefined)?.trim() || undefined
      const res = await loadTemplateFromRepo(flags.repo, branch, {revision})
      if ('error' in res) this.error(res.error, {exit: 1})
      if (res.data.alreadyExisted) {
        this.log(
          `Template repository ${flags.repo}${branch ? ` (${branch})` : ''}${revision ? ` [rev ${revision.slice(0, 12)}]` : ''} is already cached. Using the existing clone.`,
        )
      }
    }

    // Check plugin compatibility before proceeding
    if (!flags['skip-plugin-check']) {
      const templateResult = await getTemplate(args.templateName)
      if ('error' in templateResult) {
        this.error(templateResult.error, {exit: 1})
      }

      const templateData = templateResult.data
      if (!templateData) {
        this.error(`Template "${args.templateName}" not found.`, {exit: 1})
      }

      const plugins = templateData.template.config.plugins
      if (plugins && plugins.length > 0) {
        const compatibility = await checkTemplatePluginsCompatibility(this.config, plugins)

        if (!compatibility.allCompatible) {
          this.log('Plugin compatibility check failed:')
          this.log(formatPluginCompatibilityForCli(compatibility))
          this.error(
            'Cannot create project: missing or incompatible plugins. Use --skip-plugin-check to bypass this check.',
            {exit: 1},
          )
        }
      }
    }

    const settings = await readUserTemplateSettings(args.templateName, args.templateName, flags.settings)

    const res = await generateNewProject(args.projectRepositoryName, args.templateName, process.cwd(), settings, {
      git: true,
    })
    if ('error' in res) this.error(res.error, {exit: 1})

    await viewParsedDiffWithGit(res.data.diff!)
  }
}
