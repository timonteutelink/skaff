import { Flags } from '@oclif/core';

import Base from '../../base-command.js';
import { getCurrentProject } from '../../utils/cli-utils.js';

export default class ProjectRun extends Base {
  static description =
    'Execute a template command inside a project (use --project PATH to override auto-discovery)';
static flags = {
    ...Base.flags,
    command: Flags.string({
      char: 'c',
      description: 'Command title as defined by the template',
      required: true,
    }),
    instance: Flags.string({
      char: 'i',
      description: "Template instance id (use 'root' for the root template)",
      required: true,
    }),
  };

  async run() {
    const { flags } = await this.parse(ProjectRun);

    const proj = await getCurrentProject(flags.project);
    if ('error' in proj)
      this.error(proj.error, {
        exit: 1,
      });

    if (!proj.data) this.error('No project is currently selected.', { exit: 1 });

    const res = await proj.data.executeTemplateCommand(
      flags.instance,
      flags.command,
    );
    if ('error' in res) this.error(res.error, { exit: 1 });

    this.output({ output: res.data });
  }
}

