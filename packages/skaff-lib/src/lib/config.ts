import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";

const SETTINGS_DEFINITIONS = [
  {
    key: "TEMPLATE_DIR_PATHS",
    envVar: "TEMPLATE_DIRS",
    type: "string[]",
    default: [],
  },
  {
    key: "PROJECT_SEARCH_PATHS",
    envVar: "PROJECT_PATHS",
    type: "string[]",
    default: [],
  },
  {
    key: "NPM_PATH",
    envVar: "NPM_CMD",
    type: "string",
    default: "npm",
  },
] as const;

type Def = (typeof SETTINGS_DEFINITIONS)[number];

export type Settings = {
  [P in Def as P["key"]]: P["type"] extends "string[]" ? string[] : string;
};

const APP_NAME = "skaff";

function getSettingsFilePath(): string {
  if (process.env.SKAFF_CONFIG_PATH) {
    return path.join(path.resolve(process.env.SKAFF_CONFIG_PATH), "settings.json");
  }
  const configHome =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configHome, APP_NAME, "settings.json");
}

async function ensureSettingsFile(): Promise<void> {
  const file = getSettingsFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, JSON.stringify({}, null, 2), "utf-8");
  }
}

async function loadFileSettings(): Promise<Partial<Settings>> {
  await ensureSettingsFile();
  const file = getSettingsFilePath();
  const raw = await fs.readFile(file, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    // reset on parse error
    await fs.writeFile(file, JSON.stringify({}, null, 2), "utf-8");
    return {};
  }
}

function expandPath(input: string): string {
  const expanded = input.startsWith("~")
    ? path.join(os.homedir(), input.slice(1))
    : input;
  return path.resolve(expanded);
}

function parseList(raw: string): string[] {
  // split on path.delimiter or commas
  return raw
    .split(new RegExp(`[${path.delimiter},]`))
    .map((s) => expandPath(s.trim()))
    .filter(Boolean);
}

function loadEnvSettings(): Partial<Settings> {
  const envSettings: Partial<Settings> = {};

  for (const def of SETTINGS_DEFINITIONS) {
    const raw = process.env[def.envVar];
    if (raw !== undefined) {
      if (def.type === "string[]") {
        (envSettings as any)[def.key] = parseList(raw);
      } else {
        (envSettings as any)[def.key] = expandPath(raw);
      }
    }
  }

  return envSettings;
}

export async function getConfig(): Promise<Settings> {
  const fileSettings = await loadFileSettings();
  const envSettings = loadEnvSettings();

  const config = {} as Settings;
  for (const def of SETTINGS_DEFINITIONS) {
    const fileVal = fileSettings[def.key as keyof Settings] as
      | string
      | string[]
      | undefined;
    const defaultVal = def.default as string | string[];

    (config as any)[def.key] =
      envSettings[def.key as keyof Settings] ?? fileVal ?? defaultVal;
  }

  return config;
}

/**
 * Persist a single key to disk. Overwrites that key in settings.json.
 */
export async function setConfig<K extends Def["key"]>(
  key: K,
  value: Settings[K],
): Promise<void> {
  const fileSettings = await loadFileSettings();
  fileSettings[key] = value;
  await fs.writeFile(
    getSettingsFilePath(),
    JSON.stringify(fileSettings, null, 2),
    "utf-8",
  );
}

/**
 * Add items to an array setting and save.
 */
export async function addConfigItems(
  key: Extract<Def, { type: "string[]" }>["key"],
  items: string[],
): Promise<void> {
  const cfg = await getConfig();
  const existing = cfg[key] as string[];
  const additions = items.map(expandPath);
  const merged = Array.from(new Set([...existing, ...additions]));
  await setConfig(key, merged as Settings[typeof key]);
}

/**
 * Remove items from an array setting and save.
 */
export async function removeConfigItems(
  key: Extract<Def, { type: "string[]" }>["key"],
  items: string[],
): Promise<void> {
  const cfg = await getConfig();
  const existing = cfg[key] as string[];
  const toRemove = items.map(expandPath);
  const filtered = existing.filter((item) => !toRemove.includes(item));
  await setConfig(key, filtered as Settings[typeof key]);
}
