type PluginContext = {
  clearRegisteredPluginModules: () => void
  registerPluginModules: (entries: Array<Record<string, unknown>>) => void
  resetSkaffContainer: () => void
  markHardenedEnvironmentForTesting: () => void
}

let pluginContext: PluginContext | null = null

async function loadPluginContext(): Promise<PluginContext> {
  if (pluginContext) {
    return pluginContext
  }

  const skaffContainerModule = await import('../../../../packages/skaff-lib/dist/di/container.js')
  const pluginLoader = await import('../../../../packages/skaff-lib/dist/core/plugins/plugin-loader.js')
  const sandboxModule = await import(
    '../../../../packages/skaff-lib/dist/core/infra/hardened-sandbox.js'
  )

  const {clearRegisteredPluginModules, registerPluginModules} = pluginLoader as {
    clearRegisteredPluginModules: () => void
    registerPluginModules: (entries: Array<Record<string, unknown>>) => void
  }
  const {resetSkaffContainer} = skaffContainerModule as {
    resetSkaffContainer: () => void
  }
  const {markHardenedEnvironmentForTesting} = sandboxModule as {
    markHardenedEnvironmentForTesting: () => void
  }

  pluginContext = {
    clearRegisteredPluginModules,
    registerPluginModules,
    resetSkaffContainer,
    markHardenedEnvironmentForTesting,
  }

  return pluginContext
}

async function registerTestPlugins(): Promise<void> {
  const {registerPluginModules} = await loadPluginContext()
  const buildPlugin = (_name: string, _capability: 'template' | 'cli' | 'web') => ({})
  const buildManifest = (name: string, capability: 'template' | 'cli' | 'web') => ({
    name,
    version: '0.0.0',
    capabilities: [capability],
    supportedHooks: {
      template: [],
      cli: [],
      web: [],
    },
  })

  registerPluginModules([
    {
      packageName: '@timonteutelink/skaff-plugin-greeter',
      sandboxedExports: {default: buildPlugin('@timonteutelink/skaff-plugin-greeter', 'template')},
      manifest: buildManifest('@timonteutelink/skaff-plugin-greeter', 'template'),
    },
    {
      packageName: '@timonteutelink/skaff-plugin-greeter-cli',
      sandboxedExports: {default: buildPlugin('@timonteutelink/skaff-plugin-greeter-cli', 'cli')},
      manifest: buildManifest('@timonteutelink/skaff-plugin-greeter-cli', 'cli'),
    },
    {
      packageName: '@timonteutelink/skaff-plugin-greeter-web',
      sandboxedExports: {default: buildPlugin('@timonteutelink/skaff-plugin-greeter-web', 'web')},
      manifest: buildManifest('@timonteutelink/skaff-plugin-greeter-web', 'web'),
    },
  ])
}

export async function setupTestPlugins(): Promise<void> {
  const {resetSkaffContainer, markHardenedEnvironmentForTesting} = await loadPluginContext()
  resetSkaffContainer()
  markHardenedEnvironmentForTesting()
  await registerTestPlugins()
}

export async function setupTestSandbox(): Promise<void> {
  const {markHardenedEnvironmentForTesting} = await loadPluginContext()
  markHardenedEnvironmentForTesting()
}

export async function teardownTestPlugins(): Promise<void> {
  const {clearRegisteredPluginModules, resetSkaffContainer} = await loadPluginContext()
  clearRegisteredPluginModules()
  resetSkaffContainer()
}
