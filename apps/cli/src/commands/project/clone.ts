import { Args } from '@oclif/core';
import {
  generateNewProjectFromExisting,
  getProjectFromPath,
} from '@timonteutelink/skaff-lib';

import Base from '../../base-command.js';
import { viewParsedDiffWithGit } from '../../utils/diff-utils.js';

export default class InstantiationProjectClone extends Base {
  static args = {
    newProjectRepositoryName: Args.string({ required: true }),
    oldProjectPath: Args.string({ required: true }),
  };
  static description = 'Generate a new project repository from an existing one';

  async run() {
    const { args } = await this.parse(InstantiationProjectClone);

    const oldProject = await getProjectFromPath(args.oldProjectPath);
    if ('error' in oldProject) {
      this.error(oldProject.error, { exit: 1 });
    }

    if (!oldProject.data) {
      this.error('No project data found at the given path.', { exit: 1 });
    }

    const res = await generateNewProjectFromExisting(
      oldProject.data,
      process.cwd(),
      args.newProjectRepositoryName,
      { git: true },
    );
    if ('error' in res) this.error(res.error, { exit: 1 });

    await viewParsedDiffWithGit(res.data.diff!);
  }
}

