import { diffProjectFromTemplate } from '@timonteutelink/skaff-lib';

import Base from '../../base-command.js';
import { getCurrentProject } from '../../utils/cli-utils.js';

export default class GitDiffTemplate extends Base {
  static description =
    'Show the diff between a project and the template revision it was instantiated from';

  async run() {
    await this.parse(GitDiffTemplate); // ensures global flags (e.g. --format) are parsed

    const project = await getCurrentProject();
    if ('error' in project) {
      this.error(project.error, { exit: 1 });
    }

    if (!project.data) {
      this.error('No project is currently selected.', { exit: 1 });
    }

    const res = await diffProjectFromTemplate(project.data);
    if ('error' in res) this.error(res.error, { exit: 1 });

    this.output(
      res.data.files.map(f => ({
        changes: f.hunks.length,
        path: f.path,
        status: f.status,
      })),
    );
  }
}

