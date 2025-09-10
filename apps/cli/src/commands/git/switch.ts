import { Args } from '@oclif/core';
import { switchProjectBranch } from '@timonteutelink/skaff-lib';

import Base from '../../base-command.js';
import { getCurrentProject } from '../../utils/cli-utils.js';

export default class GitSwitch extends Base {
  static args = {
    branch: Args.string({ description: 'Target branch name', required: true }),
  };
  static description = 'Switch the Git branch of a project (requires a clean working tree)';

  async run() {
    const { args } = await this.parse(GitSwitch);

    const project = await getCurrentProject();
    if ('error' in project) {
      this.error(project.error, { exit: 1 });
    }

    if (!project.data) {
      this.error('No project is currently selected.', { exit: 1 });
    }

    const res = await switchProjectBranch(project.data, args.branch);
    if ('error' in res) this.error(res.error, { exit: 1 });

    this.output({
      branchSwitchedTo: args.branch,
      project: project.data.instantiatedProjectSettings.projectName,
    });
  }
}

