import { Flags } from '@oclif/core';
import { getTemplates, listTemplatesInRepo } from '@timonteutelink/skaff-lib';

import Base from '../../base-command.js';

export default class TemplateList extends Base {
  static description = 'List loaded root templates or inspect a template repository';
  static flags = {
    ...Base.flags,
    repo: Flags.string({
      description: 'Git repository URL or path to inspect for templates',
    }),
    branch: Flags.string({
      description: 'Branch to check out when using --repo',
    }),
  };

  async run() {
    const { flags } = await this.parse(TemplateList);

    if (flags.repo) {
      const branch = (flags.branch as string | undefined) ?? 'main';
      const res = await listTemplatesInRepo(flags.repo, branch);
      if ('error' in res) this.error(res.error, { exit: 1 });

      this.output(
        res.data.map((template) => ({
          revision: template.commitHash,
          description: template.config.templateConfig.description,
          name: template.config.templateConfig.name,
          isLocal: template.isLocal,
          branch: template.branch ?? branch,
          repoUrl: template.repoUrl ?? flags.repo,
        })),
      );
      return;
    }

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

