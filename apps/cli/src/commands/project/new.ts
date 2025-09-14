import { Args, Flags } from '@oclif/core';
import { generateNewProject, loadTemplateFromRepo } from '@timonteutelink/skaff-lib';

import Base from '../../base-command.js';
import { viewParsedDiffWithGit } from '../../utils/diff-utils.js';
import { readUserTemplateSettings } from '../../utils/template-utils.js';

export default class InstantiationProjectNew extends Base {
  static args = {
    projectName: Args.string({ required: true }),
    templateName: Args.string({ required: true }),
  };
  static description = 'Create a new project from a template';
  static flags = {
    ...Base.flags,
    settings: Flags.string({
      char: 's',
      description:
        'Inline JSON or path to JSON file with template settings. If omitted, settings are prompted.',
    }),
    repo: Flags.string({ description: 'Git repository URL or path to load before instantiation' }),
    branch: Flags.string({ description: 'Branch to checkout when loading repo', default: 'main' }),
  };

  async run() {
    const { args, flags } = await this.parse(InstantiationProjectNew);

    if (flags.repo) {
      const res = await loadTemplateFromRepo(flags.repo, flags.branch as string);
      if ('error' in res) this.error(res.error, { exit: 1 });
    }

    const settings = await readUserTemplateSettings(
      args.templateName,
      args.templateName,
      flags.settings,
    );

    const res = await generateNewProject(
      args.projectName,
      args.templateName,
      process.cwd(),
      settings,
      { git: true },
    );
    if ('error' in res) this.error(res.error, { exit: 1 });

    await viewParsedDiffWithGit(res.data.diff!);
  }
}

