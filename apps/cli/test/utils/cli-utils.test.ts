import type { Project, Result } from '@timonteutelink/skaff-lib';

import { afterEach, beforeEach, describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { getCurrentProject } from '../../src/utils/cli-utils.js';

describe('getCurrentProject', () => {
  let originalCwd: string;
  const createdRoots: string[] = [];

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    const roots = createdRoots.splice(0);
    if (roots.length > 0) {
      await Promise.all(
        roots.map(root => rm(root, { force: true, recursive: true })),
      );
    }
  });

  async function createProjectFixture() {
    const root = await mkdtemp(path.join(tmpdir(), 'skaff-cli-utils-'));
    createdRoots.push(root);
    await writeFile(path.join(root, 'templateSettings.json'), '{}');
    const nested = path.join(root, 'nested');
    await mkdir(nested);
    return { nested, root };
  }

  it('discovers the current project from the working directory when no override is supplied', async () => {
    const fixture = await createProjectFixture();
    process.chdir(fixture.nested);

    let loaderPath: string | undefined;
    const result = await getCurrentProject(undefined, async (projectPath) => {
      loaderPath = projectPath;
      return { data: null } as Result<null | Project>;
    });

    assert.equal(loaderPath, fixture.root);
    assert.deepEqual(result, { data: null });
  });

  it('respects an explicit project path override', async () => {
    const fixture = await createProjectFixture();

    let loaderPath: string | undefined;
    const result = await getCurrentProject(fixture.root, async (projectPath) => {
      loaderPath = projectPath;
      return { data: null } as Result<null | Project>;
    });

    assert.equal(loaderPath, fixture.root);
    assert.deepEqual(result, { data: null });
  });
});
