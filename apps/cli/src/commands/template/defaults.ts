import { getDefaultTemplates } from '@timonteutelink/skaff-lib';

import Base from '../../base-command.js';

export default class TemplateDefaults extends Base {
  static description = 'List all default root templates';

  async run() {
    await this.parse(TemplateDefaults);          // parses global flags

    const res = await getDefaultTemplates();
    if ('error' in res) this.error(res.error, { exit: 1 });

    this.output(
      res.data.map(({ template }) => ({
        defaultRevision: template.commitHash,
        description: template.config.templateConfig.description,
        name: template.config.templateConfig.name,
      })),
    );
  }
}

