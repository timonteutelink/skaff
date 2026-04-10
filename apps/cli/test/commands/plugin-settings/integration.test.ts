import {expect} from 'chai'
import {captureOutput} from '@oclif/test'
import {describe, it} from 'mocha'
import {rm} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createWorkspaceFixture, readJson, withEnv} from '../../lib/fixtures.js'
import {setupTestSandbox} from '../../lib/test-plugins.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cliRoot = path.resolve(__dirname, '..', '..', '..')

describe('cli plugin-settings commands', () => {
  async function withPluginSettingsFixture(run: (configDir: string) => Promise<void>) {
    const fixture = await createWorkspaceFixture()
    await withEnv(
      {
        SKAFF_CONFIG_PATH: fixture.configDir,
      },
      async () => {
        await setupTestSandbox()
        try {
          await run(fixture.configDir)
        } finally {
          await rm(fixture.root, {recursive: true, force: true})
        }
      },
    )
  }

  it('saves and reads plugin settings', async () => {
    await withPluginSettingsFixture(async configDir => {
      const pluginName = '@skaff/plugin-greeter'
      const settingsJson = '{"greeting":"Hello","enabled":true}'
      const setModule = await import('../../../src/commands/plugin-settings/set.js')
      const getModule = await import('../../../src/commands/plugin-settings/get.js')

      const setResult = await captureOutput(() =>
        setModule.default.run([pluginName, settingsJson], {root: cliRoot}),
      )
      expect(setResult.error).to.be.undefined

      const storedSettings = await readJson<Record<string, unknown>>(
        path.join(configDir, 'settings.json'),
      )
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
  })

  it('removes plugin settings', async () => {
    await withPluginSettingsFixture(async configDir => {
      const pluginName = '@skaff/plugin-greeter'
      const settingsJson = '{"greeting":"Hello"}'
      const setModule = await import('../../../src/commands/plugin-settings/set.js')
      const removeModule = await import('../../../src/commands/plugin-settings/remove.js')

      await captureOutput(() => setModule.default.run([pluginName, settingsJson], {root: cliRoot}))
      const removeResult = await captureOutput(() =>
        removeModule.default.run([pluginName], {root: cliRoot}),
      )
      expect(removeResult.error).to.be.undefined

      const storedSettings = await readJson<Record<string, unknown>>(
        path.join(configDir, 'settings.json'),
      )
      expect(storedSettings.plugins).to.deep.equal({})
    })
  })
})
