import { before, describe, it } from 'mocha';
import { strict as assert } from 'node:assert';

import { setupTestSandbox } from '../lib/test-plugins.js';

let parsePluginBundleMetadata: (packageJson: unknown) => { cli?: string; web?: string } | null;

before(async () => {
  await setupTestSandbox();
  ({ parsePluginBundleMetadata } = await import('../../src/utils/plugin-manager.js'));
});

describe('plugin bundle metadata', () => {
  it('parses bundle metadata from package.json', () => {
    const result = parsePluginBundleMetadata({
      skaff: {
        bundle: {
          cli: '@skaff/plugin-greeter-cli',
          web: '@skaff/plugin-greeter-web',
        },
      },
    });

    assert.deepEqual(result, {
      cli: '@skaff/plugin-greeter-cli',
      web: '@skaff/plugin-greeter-web',
    });
  });

  it('returns null when bundle metadata is missing or invalid', () => {
    assert.equal(parsePluginBundleMetadata({}), null);
    assert.equal(
      parsePluginBundleMetadata({ skaff: { bundle: { cli: 123 } } }),
      null,
    );
  });
});
