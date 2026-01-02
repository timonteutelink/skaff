import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';

import { parsePluginBundleMetadata } from '../../src/utils/plugin-manager.js';

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
