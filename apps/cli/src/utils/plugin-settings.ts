const pluginNamePattern = /^[a-zA-Z0-9-_.:@/]+$/

export function getPluginNameValidationError(pluginName: string): string | null {
  if (!pluginName.trim()) {
    return 'Plugin name is required'
  }

  if (!pluginNamePattern.test(pluginName)) {
    return 'Plugin name can only contain alphanumeric characters, dashes, underscores, dots, colons, @ and /'
  }

  return null
}
