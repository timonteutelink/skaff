import { Flags } from '@oclif/core';
import { addAllAndCommit } from '@timonteutelink/code-templator-lib';

import Base from '../../base-command.js';
import { getCurrentProject } from '../../utils/cli-utils.js';

export default class GitCommit extends Base {
  static description = 'Stage all changes and create a commit for a project';
static flags = {
    ...Base.flags,
    message: Flags.string({
      char: 'm',
      description: 'Commit message',
      required: true,
    }),
  };

  async run() {
    const { flags } = await this.parse(GitCommit);

    const project = await getCurrentProject();
    if ('error' in project) {
      this.error(project.error, { exit: 1 });
    }

    if (!project.data) {
      this.error('No project is currently selected.', { exit: 1 });
    }

    const res = await addAllAndCommit(project.data, flags.message);
    if ('error' in res) this.error(res.error, { exit: 1 });

    this.output({
      committed: true,
      message: flags.message,
      project: project.data.instantiatedProjectSettings.projectName,
    });
  }
}

