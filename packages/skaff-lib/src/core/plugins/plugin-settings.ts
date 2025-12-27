import { UserTemplateSettings } from "@timonteutelink/template-types-lib";

import { Result } from "../../lib/types";
import { LoadedTemplatePlugin } from "./plugin-types";

export type MissingRequiredPluginSettings = {
  pluginName: string;
  keys: string[];
};

function getNestedValue(
  settings: Record<string, unknown>,
  path: string,
): unknown {
  const segments = path.split(".");
  let current: unknown = settings;

  for (const segment of segments) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    if (!(segment in (current as Record<string, unknown>))) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

export function findMissingRequiredPluginSettings(
  plugins: LoadedTemplatePlugin[] | undefined,
  settings: UserTemplateSettings,
): MissingRequiredPluginSettings[] {
  if (!plugins?.length) {
    return [];
  }

  const missing: MissingRequiredPluginSettings[] = [];
  const pluginSettings =
    typeof settings.plugins === "object" && settings.plugins
      ? (settings.plugins as Record<string, unknown>)
      : undefined;

  for (const plugin of plugins) {
    const requiredKeys = plugin.requiredSettingsKeys ?? [];
    if (requiredKeys.length === 0) {
      continue;
    }

    const entry = pluginSettings?.[plugin.name];
    const pluginEntry =
      entry && typeof entry === "object"
        ? (entry as Record<string, unknown>)
        : undefined;

    const missingKeys = requiredKeys.filter((key) => {
      if (!pluginEntry) {
        return true;
      }
      return getNestedValue(pluginEntry, key) === undefined;
    });

    if (missingKeys.length > 0) {
      missing.push({ pluginName: plugin.name, keys: missingKeys });
    }
  }

  return missing;
}

export function formatMissingRequiredPluginSettings(
  missing: MissingRequiredPluginSettings[],
): string {
  if (missing.length === 0) {
    return "";
  }

  const details = missing
    .map(({ pluginName, keys }) => `${pluginName}: ${keys.join(", ")}`)
    .join("; ");
  return `Missing required plugin settings: ${details}`;
}

export function validateRequiredPluginSettings(
  plugins: LoadedTemplatePlugin[] | undefined,
  settings: UserTemplateSettings,
): Result<void> {
  const missing = findMissingRequiredPluginSettings(plugins, settings);
  if (missing.length === 0) {
    return { data: undefined };
  }

  return { error: formatMissingRequiredPluginSettings(missing) };
}
