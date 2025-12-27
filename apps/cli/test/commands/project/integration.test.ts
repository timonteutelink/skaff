import {expect} from 'chai'
import {afterEach, beforeEach, describe, it} from 'mocha'
import {execFile} from 'node:child_process'
import {mkdtemp, mkdir, readFile, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'

import {captureOutput} from '@oclif/test'

const execFileAsync = promisify(execFile)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cliRoot = path.resolve(__dirname, '..', '..', '..')
const repoRoot = path.resolve(cliRoot, '..', '..')
const templatesRoot = path.join(repoRoot, 'templates', 'test-templates')

let clearRegisteredPluginModules: () => void
let registerPluginModules: (entries: Array<Record<string, unknown>>) => void

type WorkspaceFixture = {
  root: string
  binDir: string
  cacheDir: string
  configDir: string
}

async function resolveBinaryPath(command: string): Promise<string> {
  const {stdout} = await execFileAsync('which', [command])
  return stdout.trim()
}

async function createWorkspaceFixture(): Promise<WorkspaceFixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'skaff-cli-'))
  const binDir = path.join(root, 'bin')
  const cacheDir = path.join(root, 'cache')
  const configDir = path.join(root, 'config')
  await mkdir(binDir, {recursive: true})
  await mkdir(cacheDir, {recursive: true})
  await mkdir(configDir, {recursive: true})

  const gitPath = await resolveBinaryPath('git')
  const catPath = await resolveBinaryPath('cat')
  await symlink(gitPath, path.join(binDir, 'git'))
  await symlink(catPath, path.join(binDir, 'cat'))

  return {root, binDir, cacheDir, configDir}
}

function registerTestPlugins(): void {
  const buildPlugin = (name: string, capability: 'template' | 'cli' | 'web') => ({
    manifest: {
      name,
      version: '0.0.0',
      capabilities: [capability],
      supportedHooks: {
        template: [],
        cli: [],
        web: [],
      },
    },
  })

  registerPluginModules([
    {
      packageName: '@timonteutelink/skaff-plugin-greeter',
      sandboxedExports: {default: buildPlugin('@timonteutelink/skaff-plugin-greeter', 'template')},
    },
    {
      packageName: '@timonteutelink/skaff-plugin-greeter-cli',
      sandboxedExports: {default: buildPlugin('@timonteutelink/skaff-plugin-greeter-cli', 'cli')},
    },
    {
      packageName: '@timonteutelink/skaff-plugin-greeter-web',
      sandboxedExports: {default: buildPlugin('@timonteutelink/skaff-plugin-greeter-web', 'web')},
    },
  ])
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw) as T
}

async function commitProject(projectPath: string): Promise<void> {
  await execFileAsync('git', ['-C', projectPath, 'config', 'user.email', 'test@example.com'])
  await execFileAsync('git', ['-C', projectPath, 'config', 'user.name', 'Skaff Test'])
  await execFileAsync('git', ['-C', projectPath, 'add', '.'])
  await execFileAsync('git', ['-C', projectPath, 'commit', '-m', 'init'])
}

describe('cli project commands integration', () => {
  let fixture: WorkspaceFixture
  let originalEnv: NodeJS.ProcessEnv
  let originalCwd: string

  beforeEach(async () => {
    fixture = await createWorkspaceFixture()
    originalEnv = {...process.env}
    originalCwd = process.cwd()

    process.env.SKAFF_CONFIG_PATH = fixture.configDir
    process.env.SKAFF_CACHE_PATH = fixture.cacheDir
    process.env.TEMPLATE_DIR_PATHS = templatesRoot
    process.env.PROJECT_SEARCH_PATHS = fixture.root
    process.env.SKAFF_DEV_TEMPLATES = '1'
    process.env.SKAFF_TEST_NO_LOCKDOWN = '1'
    process.env.NEXT_PUBLIC_LOG_LEVEL = 'error'
    process.env.NEXT_PUBLIC_FILE_LOG_LEVEL = 'error'
    process.env.PATH = fixture.binDir

    const skaffLib = await import('@timonteutelink/skaff-lib')
    clearRegisteredPluginModules = skaffLib.clearRegisteredPluginModules
    registerPluginModules = skaffLib.registerPluginModules

    registerTestPlugins()
    process.chdir(fixture.root)
  })

  afterEach(async () => {
    clearRegisteredPluginModules?.()
    process.chdir(originalCwd)
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key]
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value
    }
    await rm(fixture.root, {recursive: true, force: true})
  })

  async function createProjectFixture() {
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
    let settings = await readJson<{
      rootTemplateName: string
      instantiatedTemplates: Array<{id: string; templateName: string; parentId?: string}>
      projectRepositoryName: string
    }>(path.join(projectPath, 'templateSettings.json'))

    const filteredTemplates = settings.instantiatedTemplates.filter(
      (entry) => entry.templateName !== 'test_stuff',
    )

    if (filteredTemplates.length !== settings.instantiatedTemplates.length) {
      settings = {
        ...settings,
        instantiatedTemplates: filteredTemplates,
      }
      await writeFile(
        path.join(projectPath, 'templateSettings.json'),
        JSON.stringify(settings, null, 2),
      )
      await rm(path.join(projectPath, 'otherlocation'), {recursive: true, force: true})
    }

    await commitProject(projectPath)

    return {projectPath, result, settings}
  }

  it('creates a new project from templates/test-templates', async () => {
    const {projectPath, result, settings} = await createProjectFixture()
    const output = await readFile(path.join(projectPath, 'README.md'), 'utf8')

    expect(settings.rootTemplateName).to.equal('test_template')
    expect(settings.projectRepositoryName).to.equal('test-project')
    expect(settings.instantiatedTemplates[0]?.templateName).to.equal('test_template')
    expect(output).to.contain('Whats 9 + 10?')
    expect(output).to.contain('This is a nice template')
    expect(result.stdout).to.contain('diff --git')

    const diffModule = await import('../../../src/commands/project/diff/diff-from-template.js')
    const diffResult = await captureOutput(() =>
      diffModule.default.run(['--project', projectPath, '--json'], {root: cliRoot}),
    )
    expect(diffResult.error).to.be.undefined
    expect(diffResult.stdout.trim()).to.match(/^\[.*\]$/s)
  })

  it('adds a subtemplate and applies the diff', async () => {
    const {projectPath, settings} = await createProjectFixture()
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

    expect(result.error).to.be.undefined
    const parsed = JSON.parse(result.stdout) as {applied: boolean}
    expect(parsed.applied).to.equal(true)

    const updatedSettings = await readJson<{
      instantiatedTemplates: Array<{id: string; templateName: string; parentId?: string}>
    }>(path.join(projectPath, 'templateSettings.json'))

    const added = updatedSettings.instantiatedTemplates.find((entry) => entry.templateName === 'test_stuff')
    expect(added).to.exist
    expect(added?.parentId).to.equal(rootInstanceId)
  })

  it('fails when required settings are missing', async () => {
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

    expect(result.error).to.be.ok
    expect((result.error as {oclif?: {exit?: number}}).oclif?.exit).to.equal(1)
    expect((result.error as {message?: string}).message).to.contain('Failed to parse user settings')
  })

  it('fails when plugin requirements are not satisfied', async () => {
    clearRegisteredPluginModules?.()
    const commandModule = await import('../../../src/commands/project/new.js')
    const result = await captureOutput(() =>
      commandModule.default.run(
        ['missing-plugins', 'test_template', '--settings', '{"test_object":{}}', '--dev-templates'],
        {root: cliRoot},
      ),
    )

    expect(result.error).to.be.ok
    expect((result.error as {oclif?: {exit?: number}}).oclif?.exit).to.equal(1)
    expect((result.error as {message?: string}).message).to.contain('missing or incompatible plugins')
  })

  it('fails when adding a non-existent subtemplate', async () => {
    const {projectPath, settings} = await createProjectFixture()
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

    expect(result.error).to.be.ok
    expect((result.error as {oclif?: {exit?: number}}).oclif?.exit).to.equal(1)
    expect((result.error as {message?: string}).message).to.contain('Template not found')
  })
})
