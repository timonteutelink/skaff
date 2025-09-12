import { Args, Flags } from '@oclif/core';
import { loadTemplateFromRepo } from '@timonteutelink/skaff-lib';

import Base from '../../base-command.js';

export default class TemplateLoad extends Base {
  static args = {
    repo: Args.string({ description: 'Git repository URL or path', required: true }),
  };
  static description = 'Clone a template repository into cache';
  static flags = {
    ...Base.flags,
    branch: Flags.string({ description: 'Branch to checkout', default: 'main' }),
  };

  async run() {
    const { args, flags } = await this.parse(TemplateLoad);
    const res = await loadTemplateFromRepo(args.repo, flags.branch as string);
    if ('error' in res) this.error(res.error, { exit: 1 });
    this.log(`Loaded templates from ${args.repo} (${flags.branch})`);
  }
}
