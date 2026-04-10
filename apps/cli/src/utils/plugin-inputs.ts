import fs from 'node:fs/promises'

import type {
  CliPluginInputSource,
  LoadedTemplatePlugin,
  PluginInputsByPlugin,
  PluginInputValues,
} from '@timonteutelink/skaff-lib'

const PLUGIN_INPUT_SEPARATOR = ':'

interface ParsedInputArgument {
  pluginName?: string
  inputId: string
  rawValue: string
}

function parsePluginInputArgument(value: string): ParsedInputArgument {
  const separatorIndex = value.indexOf('=')
  if (separatorIndex === -1) {
    throw new Error(`Invalid plugin input "${value}". Expected "<plugin>:<input>=<value>".`)
  }

  const key = value.slice(0, separatorIndex).trim()
  const rawValue = value.slice(separatorIndex + 1)

  if (!key) {
    throw new Error(`Invalid plugin input "${value}". Missing input key.`)
  }

  const pluginSeparatorIndex = key.indexOf(PLUGIN_INPUT_SEPARATOR)
  if (pluginSeparatorIndex === -1) {
    return {inputId: key, rawValue}
  }

  const pluginName = key.slice(0, pluginSeparatorIndex).trim()
  const inputId = key.slice(pluginSeparatorIndex + 1).trim()

  if (!pluginName || !inputId) {
    throw new Error(`Invalid plugin input "${value}". Expected "<plugin>:<input>=<value>".`)
  }

  return {pluginName, inputId, rawValue}
}

async function parsePluginInputValue(rawValue: string): Promise<unknown> {
  if (rawValue.startsWith('@')) {
    const filePath = rawValue.slice(1)
    const fileContents = await fs.readFile(filePath, 'utf8')
    return JSON.parse(fileContents)
  }

  try {
    return JSON.parse(rawValue)
  } catch {
    return rawValue
  }
}

function buildInputSourceIndex(
  plugins: LoadedTemplatePlugin[],
): {
  sourcesByPlugin: Map<string, Map<string, CliPluginInputSource>>
  aliases: Map<string, string>
  inputIdIndex: Map<string, string[]>
} {
  const sourcesByPlugin = new Map<string, Map<string, CliPluginInputSource>>()
  const aliases = new Map<string, string>()
  const inputIdIndex = new Map<string, string[]>()

  for (const plugin of plugins) {
    const pluginName = plugin.name
    aliases.set(pluginName, pluginName)
    aliases.set(plugin.reference.module, pluginName)

    const sources = plugin.cliPlugin?.inputSources ?? []
    if (!sources.length) continue

    const pluginMap = new Map<string, CliPluginInputSource>()
    for (const source of sources) {
      pluginMap.set(source.id, source)
      const existing = inputIdIndex.get(source.id) ?? []
      existing.push(pluginName)
      inputIdIndex.set(source.id, existing)
    }
    sourcesByPlugin.set(pluginName, pluginMap)
  }

  return {sourcesByPlugin, aliases, inputIdIndex}
}

function setPluginInput(
  pluginInputs: PluginInputsByPlugin,
  pluginName: string,
  inputId: string,
  value: unknown,
) {
  if (!pluginInputs[pluginName]) {
    pluginInputs[pluginName] = {} as PluginInputValues
  }
  pluginInputs[pluginName]![inputId] = value
}

export async function resolveCliPluginInputs(
  plugins: LoadedTemplatePlugin[],
  rawInputs?: string[] | null,
): Promise<PluginInputsByPlugin> {
  const pluginInputs: PluginInputsByPlugin = {}
  const {sourcesByPlugin, aliases, inputIdIndex} = buildInputSourceIndex(plugins)

  for (const raw of rawInputs ?? []) {
    const {pluginName, inputId, rawValue} = parsePluginInputArgument(raw)
    const resolvedPlugin =
      pluginName ? aliases.get(pluginName) : undefined

    if (pluginName && !resolvedPlugin) {
      throw new Error(`Unknown plugin "${pluginName}" for input "${inputId}".`)
    }

    let targetPlugin = resolvedPlugin
    if (!targetPlugin) {
      const matches = inputIdIndex.get(inputId) ?? []
      if (matches.length === 1) {
        targetPlugin = matches[0]
      } else if (matches.length > 1) {
        throw new Error(
          `Plugin input "${inputId}" is ambiguous. Specify "<plugin>:${inputId}=<value>".`,
        )
      }
    }

    if (!targetPlugin) {
      throw new Error(`Unknown plugin input source "${inputId}".`)
    }

    const sources = sourcesByPlugin.get(targetPlugin)
    if (!sources?.has(inputId)) {
      throw new Error(`Plugin "${targetPlugin}" does not define input "${inputId}".`)
    }

    const value = await parsePluginInputValue(rawValue)
    setPluginInput(pluginInputs, targetPlugin, inputId, value)
  }

  for (const [pluginName, sources] of sourcesByPlugin.entries()) {
    for (const [inputId, source] of sources.entries()) {
      if (pluginInputs[pluginName]?.[inputId] !== undefined) {
        continue
      }
      if (!source.env) {
        continue
      }
      const envValue = process.env[source.env]
      if (envValue === undefined) {
        continue
      }
      const parsed = await parsePluginInputValue(envValue)
      setPluginInput(pluginInputs, pluginName, inputId, parsed)
    }
  }

  return pluginInputs
}
