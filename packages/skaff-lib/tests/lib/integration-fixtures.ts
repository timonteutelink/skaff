import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { registerPluginModules } from "../../src/core/plugins";
import greeterPluginModule from "../../../../examples/plugins/plugin-greeter/src/index";
import greeterCliPluginModule from "../../../../examples/plugins/plugin-greeter-cli/src/index";
import greeterWebPluginModule from "../../../../examples/plugins/plugin-greeter-web/src/index";

export const testTemplatesRoot = path.resolve(
  __dirname,
  "../../../../templates/test-templates",
);

export const baseUserSettings = {
  test_boolean: true,
  test_string: "Whats 9 + 10?",
  test_number: 21,
  test_object: {
    test_array: [
      { test_string_in_array: "banananananana" },
      { test_string_in_array: "banana" },
    ],
    more_stuff: "option2",
  },
};

function toSafeName(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

export async function createDeterministicTempDir(
  name: string,
  baseDir = "skaff-lib-integration",
): Promise<string> {
  const dir = path.join(os.tmpdir(), baseDir, toSafeName(name));
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function restoreEnvironment(previousEnv: Record<string, string | undefined>): void {
  if (previousEnv.SKAFF_CONFIG_PATH === undefined) {
    delete process.env.SKAFF_CONFIG_PATH;
  } else {
    process.env.SKAFF_CONFIG_PATH = previousEnv.SKAFF_CONFIG_PATH;
  }

  if (previousEnv.TEMPLATE_DIR_PATHS === undefined) {
    delete process.env.TEMPLATE_DIR_PATHS;
  } else {
    process.env.TEMPLATE_DIR_PATHS = previousEnv.TEMPLATE_DIR_PATHS;
  }

  if (previousEnv.SKAFF_CACHE_PATH === undefined) {
    delete process.env.SKAFF_CACHE_PATH;
  } else {
    process.env.SKAFF_CACHE_PATH = previousEnv.SKAFF_CACHE_PATH;
  }

  if (previousEnv.SKAFF_DEV_TEMPLATES === undefined) {
    delete process.env.SKAFF_DEV_TEMPLATES;
  } else {
    process.env.SKAFF_DEV_TEMPLATES = previousEnv.SKAFF_DEV_TEMPLATES;
  }
}

export interface IntegrationTestEnvironment {
  tempRoot: string;
  projectParentDir: string;
  cleanup: () => Promise<void>;
}

export async function setupIntegrationTestEnvironment(
  testName: string,
  options?: {
    templateDirPaths?:
      | string[]
      | ((tempRoot: string) => Promise<string[]> | string[]);
    devTemplates?: boolean;
  },
): Promise<IntegrationTestEnvironment> {
  const tempRoot = await createDeterministicTempDir(testName);
  const projectParentDir = path.join(tempRoot, "projects");
  const configDir = path.join(tempRoot, "config");
  const cacheDir = path.join(tempRoot, "cache");

  await fs.mkdir(projectParentDir, { recursive: true });
  await fs.mkdir(configDir, { recursive: true });
  await fs.mkdir(cacheDir, { recursive: true });

  const previousEnv = {
    SKAFF_CONFIG_PATH: process.env.SKAFF_CONFIG_PATH,
    TEMPLATE_DIR_PATHS: process.env.TEMPLATE_DIR_PATHS,
    SKAFF_CACHE_PATH: process.env.SKAFF_CACHE_PATH,
    SKAFF_DEV_TEMPLATES: process.env.SKAFF_DEV_TEMPLATES,
  };

  const resolvedTemplateDirPaths = options?.templateDirPaths
    ? await Promise.resolve(options.templateDirPaths).then((paths) =>
        typeof paths === "function" ? paths(tempRoot) : paths,
      )
    : [testTemplatesRoot];

  const shouldUseDevTemplates = options?.devTemplates ?? true;

  process.env.SKAFF_CONFIG_PATH = configDir;
  process.env.TEMPLATE_DIR_PATHS = resolvedTemplateDirPaths.join(
    path.delimiter,
  );
  process.env.SKAFF_CACHE_PATH = cacheDir;
  process.env.SKAFF_DEV_TEMPLATES = shouldUseDevTemplates ? "1" : "0";

  return {
    tempRoot,
    projectParentDir,
    cleanup: async () => {
      restoreEnvironment(previousEnv);
      await fs.rm(tempRoot, { recursive: true, force: true });
    },
  };
}

export function registerGreeterPlugins(options?: {
  includeSandboxedExports?: boolean;
}): void {
  const greeterCliModule = {
    ...greeterCliPluginModule,
    manifest: {
      ...greeterCliPluginModule.manifest,
      name: "greeter-cli",
    },
  };
  const greeterWebModule = {
    ...greeterWebPluginModule,
    manifest: {
      ...greeterWebPluginModule.manifest,
      name: "greeter-web",
    },
  };

  const includeSandboxedExports = options?.includeSandboxedExports ?? false;
  const withSandboxedExports = <T extends { moduleExports: unknown }>(
    entry: T,
  ) =>
    includeSandboxedExports
      ? { ...entry, sandboxedExports: entry.moduleExports }
      : entry;

  registerPluginModules([
    withSandboxedExports({
      moduleExports: greeterPluginModule,
      modulePath: path.resolve(
        __dirname,
        "../../../../examples/plugins/plugin-greeter/src/index.ts",
      ),
      packageName: "@timonteutelink/skaff-plugin-greeter",
    }),
    withSandboxedExports({
      moduleExports: greeterCliModule,
      modulePath: path.resolve(
        __dirname,
        "../../../../examples/plugins/plugin-greeter-cli/src/index.ts",
      ),
      packageName: "@timonteutelink/skaff-plugin-greeter-cli",
    }),
    withSandboxedExports({
      moduleExports: greeterWebModule,
      modulePath: path.resolve(
        __dirname,
        "../../../../examples/plugins/plugin-greeter-web/src/index.tsx",
      ),
      packageName: "@timonteutelink/skaff-plugin-greeter-web",
    }),
  ]);
}
