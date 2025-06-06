import { Args } from '@oclif/core';
import { getLoadedRevisions } from '@timonteutelink/code-templator-lib';

import Base from '../../base-command.js';

export default class TemplateShow extends Base {
  static args = {
    revision: Args.string({ description: 'Commit hash (must already be loaded)', required: true }),
    templateName: Args.string({ description: 'Template name', required: true }),
  };
static description = 'Display details for a loaded template revision';

  async run() {
    const { args } = await this.parse(TemplateShow);

    const res = await getLoadedRevisions(args.templateName);
    if ('error' in res) this.error(res.error, { exit: 1 });
    if (!res.data) this.error('Template not found', { exit: 1 });

    const tpl = res.data.find(t => t.commitHash === args.revision);
    if (!tpl)
      this.error('Revision not loaded; use `template revisions` to see available hashes', { exit: 1 });

    this.output({
      description: tpl.config.templateConfig.description,
      name: tpl.config.templateConfig.name,
      revision: tpl.commitHash,
      subTemplateCount: Object.keys(tpl.subTemplates).length,
      templatesDir: tpl.absoluteBaseDir,
    });
  }
}

