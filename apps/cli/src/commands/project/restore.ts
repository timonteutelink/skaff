import { restoreAllChanges } from '@timonteutelink/skaff-lib';

import Base from '../../base-command.js';
import { getCurrentProject } from '../../utils/cli-utils.js';

export default class InstantiationProjectRestore extends Base {
  static description = 'Restore (git reset) all uncommitted changes in a project';

  async run() {
    await this.parse(InstantiationProjectRestore); // parse global flags

    const proj = await getCurrentProject();
    if ('error' in proj) {
      this.error(proj.error, { exit: 1 });
    }

    if (!proj.data) {
      this.error('No project is currently selected.', { exit: 1 });
    }

    const res = await restoreAllChanges(proj.data);
    if ('error' in res) this.error(res.error, { exit: 1 });
  }
}

