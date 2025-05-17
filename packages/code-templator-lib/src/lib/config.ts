import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";

export interface Settings {
  TEMPLATE_DIR_PATHS: string[];
  PROJECT_SEARCH_PATHS: string[];
  GENERATE_DIFF_SCRIPT_PATH: string;
  NPM_PATH: string;
  [key: string]: unknown;
}

const APP_NAME = "code-templator";

/**
 * Returns the path to the settings file, using XDG_CONFIG_HOME or ~/.config.
 */
function getSettingsFilePath(): string {
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configHome, APP_NAME, "settings.json");
}

/**
 * Ensures that the settings file and its directory exist.
 * Creates an empty JSON file if missing.
 */
async function ensureSettingsFile(): Promise<void> {
  const file = getSettingsFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, JSON.stringify({}, null, 2), "utf-8");
  }
}

/**
 * Loads the raw settings from disk (may be empty/partial).
 */
async function loadFileSettings(): Promise<Partial<Settings>> {
  await ensureSettingsFile();
  const file = getSettingsFilePath();
  const raw = await fs.readFile(file, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    await fs.writeFile(file, JSON.stringify({}, null, 2), "utf-8");
    return {};
  }
}

/**
 * Expands home (~) and resolves any path to an absolute path.
 */
function expandPath(input: string): string {
  const withHome = input.startsWith("~")
    ? path.join(os.homedir(), input.slice(1))
    : input;
  return path.resolve(withHome);
}

/**
 * Parses a colon-delimited environment variable into a list of absolute paths.
 */
function parseEnvList(envKey: string): string[] | undefined {
  const raw = process.env[envKey];
  return raw
    ? raw.split(path.delimiter).map(expandPath)
    : undefined;
}

/**
 * Loads settings from environment variables (if set).
 */
function loadEnvSettings(): Partial<Settings> {
  const env: Partial<Settings> = {};

  const templateDirs = parseEnvList("TEMPLATE_DIR_PATHS");
  if (templateDirs) env.TEMPLATE_DIR_PATHS = templateDirs;

  const projectPaths = parseEnvList("PROJECT_SEARCH_PATHS");
  if (projectPaths) env.PROJECT_SEARCH_PATHS = projectPaths;

  if (process.env.GENERATE_DIFF_SCRIPT_PATH) {
    env.GENERATE_DIFF_SCRIPT_PATH = expandPath(
      process.env.GENERATE_DIFF_SCRIPT_PATH
    );
  }

  if (process.env.NPM_PATH) {
    env.NPM_PATH = expandPath(process.env.NPM_PATH);
  }

  return env;
}

/**
 * Returns the merged configuration: file settings < defaults < environment.
 */
export async function getConfig(): Promise<Settings> {
  const fileSettings = await loadFileSettings();
  const envSettings = loadEnvSettings();

  const defaults: Settings = {
    TEMPLATE_DIR_PATHS: [path.resolve(os.homedir(), "projects", "timon", "example-templates-dir")],
    PROJECT_SEARCH_PATHS: [path.resolve(os.homedir(), "projects")],
    GENERATE_DIFF_SCRIPT_PATH: path.resolve(
      os.homedir(), "projects", "timon", "code-templator", "scripts", "generate-diff-patch.sh"
    ),
    NPM_PATH: "npm",
  };

  return {
    TEMPLATE_DIR_PATHS:
      envSettings.TEMPLATE_DIR_PATHS ??
      (fileSettings.TEMPLATE_DIR_PATHS as string[]) ??
      defaults.TEMPLATE_DIR_PATHS,
    PROJECT_SEARCH_PATHS:
      envSettings.PROJECT_SEARCH_PATHS ??
      (fileSettings.PROJECT_SEARCH_PATHS as string[]) ??
      defaults.PROJECT_SEARCH_PATHS,
    GENERATE_DIFF_SCRIPT_PATH:
      envSettings.GENERATE_DIFF_SCRIPT_PATH ??
      (fileSettings.GENERATE_DIFF_SCRIPT_PATH as string) ??
      defaults.GENERATE_DIFF_SCRIPT_PATH,
    NPM_PATH:
      envSettings.NPM_PATH ??
      (fileSettings.NPM_PATH as string) ??
      defaults.NPM_PATH,
  };
}

/**
 * Writes a single setting key to disk (merging into existing settings JSON).
 */
export async function setConfig<
  K extends keyof Settings
>(key: K, value: Settings[K]): Promise<void> {
  const fileSettings = await loadFileSettings();
  fileSettings[key] = value;
  await fs.writeFile(
    getSettingsFilePath(),
    JSON.stringify(fileSettings, null, 2),
    "utf-8"
  );
}

