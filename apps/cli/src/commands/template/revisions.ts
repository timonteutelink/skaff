import { Args } from '@oclif/core';
import { getLoadedRevisions } from '@timonteutelink/skaff-lib';

import Base from '../../base-command.js';

export default class TemplateRevisions extends Base {
  static args = {
    templateName: Args.string({ description: 'Template name', required: true }),
  };
static description = 'List loaded revisions for a template';

  async run() {
    const { args } = await this.parse(TemplateRevisions);

    const res = await getLoadedRevisions(args.templateName);
    if ('error' in res) this.error(res.error, { exit: 1 });
    if (!res.data) this.error('No revisions found for this template', { exit: 1 });

    this.output(
      res.data.map(t => ({
        dir: t.absoluteDir,
        isDefault: t.isDefault,
        revision: t.commitHash,
      })),
    );
  }
}

