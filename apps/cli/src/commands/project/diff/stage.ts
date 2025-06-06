import { addAllAndDiff } from '@timonteutelink/code-templator-lib';

import Base from '../../../base-command.js';
import { getCurrentProject } from '../../../utils/cli-utils.js';

export default class InstantiationDiffStage extends Base {
  static description = 'Stage all changes in a project and show the diff';

  async run() {
    await this.parse(InstantiationDiffStage);

    const proj = await getCurrentProject();
    if ('error' in proj) {
      this.error(proj.error ?? 'No project in the current directory.', { exit: 1 });
    }

    if (!proj.data) {
      this.error('No project is currently selected.', { exit: 1 });
    }

    const res = await addAllAndDiff(proj.data);
    if ('error' in res) this.error(res.error, { exit: 1 });

    this.output(res.data.map(d => ({
      diff: d.hunks.length > 0 ? d.hunks.reduce<string>((prev, curr, index, hunks) => `${prev}\n\n${hunks[index].lines.join('\n')}`, '') : '',
      file: d.path,
      status: d.status,
    })))
  }
}

