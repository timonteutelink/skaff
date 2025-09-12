import { reloadTemplates } from '@timonteutelink/skaff-lib';

import Base from '../../base-command.js';

export default class TemplateReload extends Base {
  static description = 'Reload templates from disk and show loaded templates afterwards';

  async run() {
    await this.parse(TemplateReload);

    const res = await reloadTemplates();
    if ('error' in res) this.error(res.error, { exit: 1 });

    this.output(
      res.data.map(({ revisions, template }) => ({
        revision: template.commitHash,
        name: template.config.templateConfig.name,
        totalRevisions: revisions.length,
        isLocal: template.isLocal,
        branch: template.branch,
      })),
    );
  }
}

