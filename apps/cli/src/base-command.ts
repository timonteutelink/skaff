import { Command, Flags } from '@oclif/core';

import { DEFAULT_FORMAT, Format, printFormatted } from './utils/cli-utils.js';

export default abstract class BaseCommand extends Command {
  /** Global flags available to every command */
  static flags = {
    format: Flags.string({
      char: 'f',
      default: DEFAULT_FORMAT,
      description: 'output format',
      options: ['json', 'ndjson', 'tsv', 'table'],
    }),
    help: Flags.help({ char: 'h' }),
    project: Flags.string({
      description:
        'Path to a project directory to operate on (overrides auto-discovery)',
      helpValue: 'path',
    }),
  };

  /** Convenience helper for children */
  protected async output<T extends Record<string, unknown>>(data: T | T[]) {
    const { flags } = await this.parse();
    printFormatted(data, (flags.format ?? DEFAULT_FORMAT) as Format);
  }
}

