import { Args, Flags } from '@oclif/core';
import {
  applyDiff,
  prepareModificationDiff,
} from '@timonteutelink/skaff-lib';

import Base from '../../../base-command.js';
import { getCurrentProject } from '../../../utils/cli-utils.js';
import { readUserTemplateSettings } from '../../../utils/template-utils.js';

export default class InstantiationDiffPrepareModification extends Base {
  static args = {
    templateInstanceId: Args.string({ required: true }),
  };
  static description =
    'Prepare a diff for modifying an existing template instance (use --project PATH to override auto-discovery)';
static flags = {
    ...Base.flags,
    apply: Flags.boolean({ char: 'a', default: false }),
    settings: Flags.string({ char: 's' }),
  };

  async run() {
    const { args, flags } = await this.parse(
      InstantiationDiffPrepareModification,
    );

    const proj = await getCurrentProject(flags.project);
    if ('error' in proj) {
      this.error(proj.error ?? 'No project in the current directory.', { exit: 1 });
    }

    if (!proj.data) {
      this.error('No project is currently selected.', { exit: 1 });
    }

    const instTpl =
      proj.data.instantiatedProjectSettings.instantiatedTemplates.find(
        (i) => i.id === args.templateInstanceId,
      );
    if (!instTpl) {
      this.error(`No template instance "${args.templateInstanceId}"`, { exit: 1 });
    }

    const settings = await readUserTemplateSettings(
      proj.data.rootTemplate.config.templateConfig.name,
      instTpl.templateName,
      flags.settings,
    );

    const res = await prepareModificationDiff(
      settings,
      proj.data,
      args.templateInstanceId,
    );
    if ('error' in res) this.error(res.error, { exit: 1 });

    if (flags.apply) {
      const applied = await applyDiff(proj.data, res.data.diffHash);
      if ('error' in applied) this.error(applied.error, { exit: 1 });
      this.output({ applied: true, files: applied.data });
    } else {
      this.output({ diffHash: res.data.diffHash });
    }
  }
}

