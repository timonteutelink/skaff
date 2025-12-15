"use server";

import * as tempLib from "@timonteutelink/skaff-lib";
import type { Result } from "@timonteutelink/skaff-lib";

/**
 * Plugin settings entry with metadata.
 */
export interface PluginSettingsEntry {
  pluginName: string;
  settings: unknown;
}

/**
 * Retrieves all plugin system settings.
 */
export async function retrieveAllPluginSettings(): Promise<
  Result<Record<string, unknown>>
> {
  try {
    const settings = await tempLib.getAllPluginSystemSettings();
    return { data: settings };
  } catch (error) {
    return {
      error: `Failed to retrieve plugin settings: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Retrieves system settings for a specific plugin.
 */
export async function retrievePluginSettings(
  pluginName: string,
): Promise<Result<unknown>> {
  try {
    const settings = await tempLib.getPluginSystemSettings(pluginName);
    return { data: settings };
  } catch (error) {
    return {
      error: `Failed to retrieve settings for plugin ${pluginName}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Saves system settings for a specific plugin.
 */
export async function savePluginSettings(
  pluginName: string,
  settings: unknown,
): Promise<Result<void>> {
  try {
    await tempLib.setPluginSystemSettings(pluginName, settings);
    return { data: undefined };
  } catch (error) {
    return {
      error: `Failed to save settings for plugin ${pluginName}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Removes system settings for a specific plugin.
 */
export async function removePluginSettings(
  pluginName: string,
): Promise<Result<void>> {
  try {
    await tempLib.removePluginSystemSettings(pluginName);
    return { data: undefined };
  } catch (error) {
    return {
      error: `Failed to remove settings for plugin ${pluginName}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
