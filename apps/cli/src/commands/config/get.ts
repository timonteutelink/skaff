import { Args } from '@oclif/core';
import { getConfig } from '@timonteutelink/code-templator-lib';

import Base from '../../base-command.js';

export default class ConfigGet extends Base {
  static args = {
    key: Args.string({ description: 'config key', required: false }),
  };
  static description = 'Show all settings or a single key';

  async run() {
    const { args } = await this.parse(ConfigGet);
    const cfg = await getConfig();

    if (args.key) {
      if (!(args.key in cfg)) {
        this.error(
          `Unknown key '${args.key}'. Valid keys: ${Object.keys(cfg).join(', ')}`,
          { exit: 1 },
        );
      }

      this.output({ [args.key]: (cfg as any)[args.key] });
    } else {
      this.output(cfg);
    }
  }
}

