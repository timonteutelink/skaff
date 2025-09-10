import { Args } from '@oclif/core';
import { deleteProject, getProjectFromPath } from '@timonteutelink/skaff-lib';

import Base from '../../base-command.js';

export default class InstantiationProjectDelete extends Base {
  static args = {
    projectPath: Args.string({ required: true }),
  };
static description = 'Delete a project (removes its git repo)';

  async run() {
    const { args } = await this.parse(InstantiationProjectDelete);

    const proj = await getProjectFromPath(args.projectPath);
    if ('error' in proj) {
      this.error(proj.error, { exit: 1 });
    }

    if (!proj.data) {
      this.error('No project data found at the given path.', { exit: 1 });
    }

    const res = await deleteProject(proj.data);
    if ('error' in res) this.error(res.error, { exit: 1 });
  }
}

