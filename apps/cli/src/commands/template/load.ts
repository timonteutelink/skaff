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
    branch: Flags.string({ description: 'Branch to track (optional)' }),
    revision: Flags.string({ description: 'Specific commit hash to pin (optional)' }),
    refresh: Flags.boolean({
      description: 'Fetch latest changes even if the repository is already cached',
      default: false,
    }),
  };

  async run() {
    const { args, flags } = await this.parse(TemplateLoad);
    const branch = (flags.branch as string | undefined)?.trim() || undefined;
    const revision = (flags.revision as string | undefined)?.trim() || undefined;
    const refresh = Boolean(flags.refresh);
    const res = await loadTemplateFromRepo(args.repo, branch, {
      refresh,
      revision,
    });
    if ('error' in res) this.error(res.error, { exit: 1 });

    const descriptorParts = [];
    if (branch) {
      descriptorParts.push(`branch ${branch}`);
    }
    if (revision) {
      descriptorParts.push(`rev ${revision.slice(0, 12)}`);
    }
    const repoDescriptor = descriptorParts.length
      ? ` (${descriptorParts.join(', ')})`
      : '';

    if (res.data.alreadyExisted && !refresh) {
      this.log(
        `Template repository ${args.repo}${repoDescriptor} is already loaded. Use --refresh to fetch the latest changes.`,
      );
      return;
    }

    if (refresh || res.data.alreadyExisted) {
      this.log(`Refreshed templates from ${args.repo}${repoDescriptor}`);
      return;
    }

    this.log(`Loaded templates from ${args.repo}${repoDescriptor}`);
  }
}
