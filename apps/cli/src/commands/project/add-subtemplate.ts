import { Args, Flags } from '@oclif/core';
import * as skaffLib from '@timonteutelink/skaff-lib';

import Base from '../../base-command.js';
import { getCurrentProject } from '../../utils/cli-utils.js';
import { readUserTemplateSettings } from '../../utils/template-utils.js';

export default class ProjectAddSubtemplate extends Base {
  static args = {
    parentInstanceId: Args.string({ required: true }),
    rootTemplateName: Args.string({ required: true }),
    templateName: Args.string({ required: true }),
  };
  static description =
    'Add a subtemplate to the current project and generate a diff (use --project PATH to override auto-discovery)';
  static flags = {
    ...Base.flags,
    apply: Flags.boolean({ char: 'a', default: false }),
    settings: Flags.string({ char: 's' }),
  };

  async run() {
    const { args, flags } = await this.parse(ProjectAddSubtemplate);

    const proj = await getCurrentProject(flags.project);
    if ('error' in proj) {
      this.error(proj.error, { exit: 1 });
    }

    if (!proj.data) {
      this.error('No project found', { exit: 1 });
    }

    const settings = await readUserTemplateSettings(
      args.rootTemplateName,
      args.templateName,
      flags.settings,
      undefined,
      {
        projectSettings: proj.data.instantiatedProjectSettings,
      },
    );

    const res = await skaffLib.prepareInstantiationDiff(
      args.rootTemplateName,
      args.templateName,
      args.parentInstanceId,
      proj.data,
      settings,
    );
    if ('error' in res) this.error(res.error, { exit: 1 });

    if (flags.apply) {
      const applied = await skaffLib.applyDiff(proj.data, res.data.diffHash);
      if ('error' in applied) this.error(applied.error, { exit: 1 });
      await this.output({ applied: true, files: applied.data });
    } else {
      await this.output({ diffHash: res.data.diffHash });
    }
  }
}
