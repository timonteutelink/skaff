import {expect} from 'chai'
import {describe, it} from 'mocha'
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {captureOutput} from '@oclif/test'
import {createWorkspaceFixture, readJson, withEnv} from '../../lib/fixtures.js'
import {setupTestPlugins, teardownTestPlugins} from '../../lib/test-plugins.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cliRoot = path.resolve(__dirname, '..', '..', '..')
const repoRoot = path.resolve(cliRoot, '..', '..')
const templatesRoot = path.join(repoRoot, 'templates', 'test-templates')

type WorkspaceFixture = {
  root: string
  binDir: string
  cacheDir: string
  configDir: string
}

describe('cli project commands integration', () => {
  const sharedCacheDir = path.join(repoRoot, '.skaff-test-cache')

  async function withProjectFixture(
    run: (fixture: WorkspaceFixture) => Promise<void>,
  ): Promise<void> {
    const fixture = await createWorkspaceFixture()
    const originalCwd = process.cwd()
    await withEnv(
      {
        SKAFF_CONFIG_PATH: fixture.configDir,
        SKAFF_CACHE_PATH: sharedCacheDir,
        TEMPLATE_DIR_PATHS: templatesRoot,
        PROJECT_SEARCH_PATHS: fixture.root,
        SKAFF_DEV_TEMPLATES: '1',
        ESBUILD_BINARY_PATH: path.join(repoRoot, 'node_modules', 'esbuild', 'bin', 'esbuild'),
        NEXT_PUBLIC_LOG_LEVEL: 'error',
        NEXT_PUBLIC_FILE_LOG_LEVEL: 'error',
        GIT_AUTHOR_NAME: 'skaff-test',
        GIT_AUTHOR_EMAIL: 'skaff-test@example.com',
        GIT_COMMITTER_NAME: 'skaff-test',
        GIT_COMMITTER_EMAIL: 'skaff-test@example.com',
      },
      async () => {
        await mkdir(sharedCacheDir, {recursive: true})
        await writeFile(
          path.join(fixture.configDir, 'settings.json'),
          JSON.stringify(
            {
              TEMPLATE_DIR_PATHS: [templatesRoot],
              PROJECT_SEARCH_PATHS: [fixture.root],
            },
            null,
            2,
          ),
          'utf8',
        )

        await setupTestPlugins()
        process.chdir(fixture.root)

        const templateModule = await import(
          '../../../../../packages/skaff-lib/dist/actions/template/get-template.js'
        )
        const templateResult = await templateModule.getTemplate('test_template')
        if ('error' in templateResult) {
          throw new Error(templateResult.error)
        }
        if (!templateResult.data) {
          throw new Error('Preloading test_template failed')
        }

        try {
          await run(fixture)
        } finally {
          await teardownTestPlugins()
          process.chdir(originalCwd)
          await rm(fixture.root, {recursive: true, force: true})
        }
      },
    )
  }

  async function createProjectFixture(fixture: WorkspaceFixture) {
    const projectName = 'test-project'
    const commandModule = await import('../../../src/commands/project/new.js')
    const result = await captureOutput(() =>
      commandModule.default.run(
        [
          projectName,
          'test_template',
          '--settings',
          '{"test_object":{}}',
          '--skip-plugin-check',
          '--dev-templates',
        ],
        {root: cliRoot},
      ),
    )

    if (result.error) {
      throw result.error
    }

    const projectPath = path.join(fixture.root, projectName)
    const settings = await readJson<{
      rootTemplateName: string
      instantiatedTemplates: Array<{id: string; templateName: string; parentId?: string}>
      projectRepositoryName: string
    }>(path.join(projectPath, 'templateSettings.json'))

    return {projectPath, result, settings}
  }

  it('creates a new project from templates/test-templates', async () => {
    await withProjectFixture(async fixture => {
      const {projectPath, result, settings} = await createProjectFixture(fixture)
      const output = await readFile(path.join(projectPath, 'README.md'), 'utf8')

      expect(settings.rootTemplateName).to.equal('test_template')
      expect(settings.projectRepositoryName).to.equal('test-project')
      expect(settings.instantiatedTemplates[0]?.templateName).to.equal('test_template')
      expect(output).to.contain('Whats 9 + 10?')
      expect(output).to.contain('This is a nice template')
      expect(result.stdout).to.contain('diff --git')

      const diffModule = await import('../../../src/commands/project/diff/diff-from-template.js')
      const diffResult = await captureOutput(() =>
        diffModule.default.run(['--project', projectPath, '--json', '--dev-templates'], {
          root: cliRoot,
        }),
      )
      expect(diffResult.error).to.be.undefined
      const combinedOutput = `${diffResult.stdout}\n${diffResult.stderr}`
      const jsonLine = combinedOutput
        .split('\n')
        .find(line => line.trim().startsWith('['))
      expect(jsonLine).to.not.be.undefined
      if (jsonLine) {
        const parsed = JSON.parse(jsonLine) as unknown[]
        expect(parsed).to.be.an('array')
      }
    })
  })

  it('fails when adding a subtemplate that already exists', async () => {
    await withProjectFixture(async fixture => {
      const {projectPath, settings} = await createProjectFixture(fixture)
      const rootInstanceId = settings.instantiatedTemplates[0]?.id
      expect(rootInstanceId).to.be.ok

      const addModule = await import('../../../src/commands/project/add-subtemplate.js')
      const result = await captureOutput(() =>
        addModule.default.run(
          [
            rootInstanceId!,
            'test_template',
            'test_stuff',
            '--apply',
            '--settings',
            '{}',
            '--format',
            'json',
            '--project',
            projectPath,
            '--dev-templates',
          ],
          {root: cliRoot},
        ),
      )

      expect(result.error).to.be.ok
      expect(String(result.error)).to.contain('already exists')
    })
  })

  it('fails when required settings are missing', async () => {
    await withProjectFixture(async () => {
      const commandModule = await import('../../../src/commands/project/new.js')
      const result = await captureOutput(() =>
        commandModule.default.run(
          [
            'missing-settings',
            'test_template',
            '--settings',
            '{}',
            '--skip-plugin-check',
            '--dev-templates',
          ],
          {root: cliRoot},
        ),
      )

      const errorText = result.error
        ? String(result.error)
        : `${result.stdout}\n${result.stderr}`
      expect(errorText).to.match(/Failed to parse user settings|Invalid template settings/i)
    })
  })

  it('fails when plugin requirements are not satisfied', async () => {
    await withProjectFixture(async () => {
      const commandModule = await import('../../../src/commands/project/new.js')
      const result = await captureOutput(() =>
        commandModule.default.run(
          [
            'missing-plugins',
            'test_template',
            '--settings',
            '{"test_object":{}}',
            '--dev-templates',
          ],
          {root: cliRoot},
        ),
      )

      expect(result.error).to.be.ok
      expect((result.error as {oclif?: {exit?: number}}).oclif?.exit).to.equal(1)
      expect(String(result.error)).to.contain('missing or incompatible plugins')
    })
  })

  it('fails when adding a non-existent subtemplate', async () => {
    await withProjectFixture(async fixture => {
      const {projectPath, settings} = await createProjectFixture(fixture)
      const rootInstanceId = settings.instantiatedTemplates[0]?.id

      const addModule = await import('../../../src/commands/project/add-subtemplate.js')
      const result = await captureOutput(() =>
        addModule.default.run(
          [
            rootInstanceId!,
            'test_template',
            'does_not_exist',
            '--settings',
            '{}',
            '--project',
            projectPath,
            '--dev-templates',
          ],
          {root: cliRoot},
        ),
      )

      const errorText = result.error
        ? String(result.error)
        : `${result.stdout}\n${result.stderr}`
      expect(errorText).to.match(/Template not found|No sub-template/i)
    })
  })
})
