import {expect} from 'chai'
import {captureOutput} from '@oclif/test'
import {afterEach, beforeEach, describe, it} from 'mocha'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import sandboxModule from '../../../../../packages/skaff-lib/dist/core/infra/hardened-sandbox.js'

const {markHardenedEnvironmentForTesting} = sandboxModule as {
  markHardenedEnvironmentForTesting: () => void
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cliRoot = path.resolve(__dirname, '..', '..', '..')

type Fixture = {
  root: string
}

async function readSettings(root: string): Promise<Record<string, unknown>> {
  const raw = await readFile(path.join(root, 'settings.json'), 'utf8')
  return JSON.parse(raw) as Record<string, unknown>
}

describe('cli plugin-settings commands', () => {
  let fixture: Fixture
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(async () => {
    fixture = {root: await mkdtemp(path.join(tmpdir(), 'skaff-cli-plugin-settings-'))}
    originalEnv = {...process.env}
    process.env.SKAFF_CONFIG_PATH = fixture.root
    markHardenedEnvironmentForTesting()
  })

  afterEach(async () => {
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

  it('saves and reads plugin settings', async () => {
    const pluginName = '@skaff/plugin-greeter'
    const settingsJson = '{"greeting":"Hello","enabled":true}'
    const setModule = await import('../../../src/commands/plugin-settings/set.js')
    const getModule = await import('../../../src/commands/plugin-settings/get.js')

    const setResult = await captureOutput(() =>
      setModule.default.run([pluginName, settingsJson], {root: cliRoot}),
    )
    expect(setResult.error).to.be.undefined

    const storedSettings = await readSettings(fixture.root)
    expect(storedSettings.plugins).to.deep.equal({
      [pluginName]: {greeting: 'Hello', enabled: true},
    })

    const getResult = await captureOutput(() =>
      getModule.default.run([pluginName, '--format', 'json'], {root: cliRoot}),
    )
    expect(getResult.error).to.be.undefined

    const parsed = JSON.parse(getResult.stdout) as {
      pluginName: string
      settings: Record<string, unknown>
    }
    expect(parsed.pluginName).to.equal(pluginName)
    expect(parsed.settings).to.deep.equal({greeting: 'Hello', enabled: true})
  })

  it('removes plugin settings', async () => {
    const pluginName = '@skaff/plugin-greeter'
    const settingsJson = '{"greeting":"Hello"}'
    const setModule = await import('../../../src/commands/plugin-settings/set.js')
    const removeModule = await import('../../../src/commands/plugin-settings/remove.js')

    await captureOutput(() => setModule.default.run([pluginName, settingsJson], {root: cliRoot}))
    const removeResult = await captureOutput(() => removeModule.default.run([pluginName], {root: cliRoot}))
    expect(removeResult.error).to.be.undefined

    const storedSettings = await readSettings(fixture.root)
    expect(storedSettings.plugins).to.deep.equal({})
  })
})
