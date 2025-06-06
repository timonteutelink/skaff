import { eraseCache } from '@timonteutelink/code-templator-lib';

import Base from '../../base-command.js';

export default class TemplateEraseCache extends Base {
  static description = 'Erase the template cache, then reload';

  async run() {
    await this.parse(TemplateEraseCache);

    const res = await eraseCache();
    if ('error' in res) this.error(res.error, { exit: 1 });

    this.output(
      res.data.map(({ revisions, template }) => ({
        defaultRevision: template.commitHash,
        name: template.config.templateConfig.name,
        totalRevisions: revisions.length,
      })),
    );
  }
}

