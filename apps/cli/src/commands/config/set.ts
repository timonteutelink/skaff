import { Args } from '@oclif/core';
import { setConfig, Settings } from '@timonteutelink/skaff-lib';

import Base from '../../base-command.js';

export default class ConfigSet extends Base {
  static args = {
    key: Args.string({ required: true }),
    value: Args.string({ required: true }),
  };
static description =
    'Set a scalar setting (for list keys, use `config:add` / `config:remove`)';

  async run() {
    const { args } = await this.parse(ConfigSet);
    await setConfig(args.key as keyof Settings, args.value);
    this.log(`Updated ${args.key} = ${args.value}`);
  }
}

