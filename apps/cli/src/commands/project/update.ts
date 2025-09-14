import { Args, Flags } from '@oclif/core';
import { applyDiff, prepareUpdateDiff } from '@timonteutelink/skaff-lib';

import Base from '../../base-command.js';
import { getCurrentProject } from '../../utils/cli-utils.js';

export default class ProjectUpdate extends Base {
  static args = {
    newRevisionHash: Args.string({ required: true }),
  };

  static description = 'Update current project to a new template revision and generate a diff';

  static flags = {
    ...Base.flags,
    apply: Flags.boolean({ char: 'a', default: false }),
  };

  async run() {
    const { args, flags } = await this.parse(ProjectUpdate);

    const proj = await getCurrentProject();
    if ('error' in proj) {
      this.error(proj.error ?? 'No project in the current directory.', { exit: 1 });
    }

    if (!proj.data) {
      this.error('No project is currently selected.', { exit: 1 });
    }

    const res = await prepareUpdateDiff(proj.data, args.newRevisionHash);
    if ('error' in res) this.error(res.error, { exit: 1 });

    if (flags.apply) {
      const applied = await applyDiff(proj.data, res.data.diffHash);
      if ('error' in applied) this.error(applied.error, { exit: 1 });
      this.output({ applied: true, files: applied.data });
    } else {
      this.output({ diffHash: res.data.diffHash });
    }
  }
}

