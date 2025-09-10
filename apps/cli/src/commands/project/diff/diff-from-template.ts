import { Flags } from '@oclif/core';
import { diffProjectFromTemplate } from '@timonteutelink/skaff-lib';

import Base from '../../../base-command.js';
import { getCurrentProject } from '../../../utils/cli-utils.js';
import { viewExistingPatchWithGit } from '../../../utils/diff-utils.js';

export default class InstantiationDiffFromTemplate extends Base {
  static description =
    'Generate a diff from the current project to a clean template';
static flags = {
    ...Base.flags,
    json: Flags.boolean({ description: 'Output raw JSON' }),
    tool: Flags.string({
      description:
        'Diff viewer (less, bat, delta, diff-so-fancy, git-split-diffs)',
    }),
  };

  async run() {
    const { flags } = await this.parse(InstantiationDiffFromTemplate);

    const proj = await getCurrentProject();
    if ('error' in proj) {
      this.error(proj.error, { exit: 1 });
    }

    if (!proj.data) {
      this.error('No project is currently selected.', { exit: 1 });
    }

    const res = await diffProjectFromTemplate(proj.data);
    if ('error' in res) this.error(res.error, { exit: 1 });

    if (flags.json) {
      this.log(JSON.stringify(res.data.files));
    } else {
      await viewExistingPatchWithGit(
        'project-from-template-diff',
        res.data.hash,
        { tool: flags.tool },
      );
    }
  }
}

