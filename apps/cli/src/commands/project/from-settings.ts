import { Args } from '@oclif/core';
import { generateNewProjectFromSettings } from '@timonteutelink/skaff-lib';
import fs from 'node:fs';

import Base from '../../base-command.js';
import { viewParsedDiffWithGit } from '../../utils/diff-utils.js';

export default class InstantiationProjectFromSettings extends Base {
  static args = {
    newProjectName: Args.string({ required: true }),
    settingsFileOrJson: Args.string({ required: true }),
  };
static description = 'Generate a project entirely from a ProjectSettings JSON';

  async run() {
    const { args } = await this.parse(InstantiationProjectFromSettings);

    const settingsStr = fs.existsSync(args.settingsFileOrJson)
      ? fs.readFileSync(args.settingsFileOrJson, 'utf8')
      : args.settingsFileOrJson;

    const res = await generateNewProjectFromSettings(
      settingsStr,
      process.cwd(),
      args.newProjectName,
      { git: true },
    );
    if ('error' in res) this.error(res.error, { exit: 1 });

    await viewParsedDiffWithGit(res.data.diff!);
  }
}

