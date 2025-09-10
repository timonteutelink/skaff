import { Args } from '@oclif/core';
import {
  addConfigItems

} from '@timonteutelink/skaff-lib';

import Base from '../../base-command.js';

const ARRAY_KEYS = ['TEMPLATE_DIR_PATHS', 'PROJECT_SEARCH_PATHS'] as const;

export default class ConfigAdd extends Base {
  static args = {
    items: Args.string({ multiple: true, required: true }),
    key: Args.string({ required: true }),
  };
  static description = 'Add one or more values to an array setting';

  async run() {
    const { args } = await this.parse(ConfigAdd);
    if (!ARRAY_KEYS.includes(args.key as any)) {
      this.error(
        `'${args.key}' is not a list setting. Valid: ${ARRAY_KEYS.join(', ')}`,
        { exit: 1 },
      );
    }

    await addConfigItems(args.key as any, args.items as unknown as string[]);
    this.log(`Added ${(args.items as unknown as string[]).join(', ')} to ${args.key}`);
  }
}

