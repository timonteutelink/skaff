import { Args } from '@oclif/core';
import { applyDiff } from '@timonteutelink/code-templator-lib';

import Base from '../../../base-command.js';
import { getCurrentProject } from '../../../utils/cli-utils.js';

export default class InstantiationDiffApply extends Base {
  static args = {
    diffHash: Args.string({ required: true }),
  };
static description = 'Apply a previously prepared diff by its hash';

  async run() {
    const { args } = await this.parse(InstantiationDiffApply);

    const proj = await getCurrentProject();
    if ('error' in proj) {
      this.error(proj.error, { exit: 1 });
    }

    if (!proj.data) {
      this.error('No project is currently selected.', { exit: 1 });
    }

    const res = await applyDiff(proj.data, args.diffHash);
    if ('error' in res) this.error(res.error, { exit: 1 });

    if ('resolveBeforeContinuing' in res.data) {
      this.output({output: "The diff contains unresolved changes. Please resolve them before continuing."});
      return;
    }

    this.output(res.data.map(d => ({
      diff: d.hunks.length > 0 ? d.hunks.reduce<string>((prev, curr, index, hunks) => `${prev}\n\n${hunks[index].lines.join('\n')}`, '') : '',
      file: d.path,
      status: d.status,
    })))
  }
}

