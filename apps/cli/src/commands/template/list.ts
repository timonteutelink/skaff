import { getTemplates } from '@timonteutelink/skaff-lib';

import Base from '../../base-command.js';

export default class TemplateList extends Base {
  static description = 'List all loaded root templates';

  async run() {
    await this.parse(TemplateList);          // parses global flags

    const res = await getTemplates();
    if ('error' in res) this.error(res.error, { exit: 1 });

    this.output(
      res.data.map(({ template }) => ({
        revision: template.commitHash,
        description: template.config.templateConfig.description,
        name: template.config.templateConfig.name,
        isLocal: template.isLocal,
        branch: template.branch,
        repoUrl: template.repoUrl,
      })),
    );
  }
}

