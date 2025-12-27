import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as crypto from "node:crypto";

import { generateNewProject } from "../src/actions/instantiate/generate-new-project";
import { prepareModificationDiff } from "../src/actions/instantiate/prepare-modification-diff";
import { resolveProjectDiffPlanner } from "../src/core/diffing/ProjectDiffPlanner";
import {
  clearRegisteredPluginModules,
  registerPluginModules,
} from "../src/core/plugins";
import {
  createDefaultContainer,
  resetSkaffContainer,
  setSkaffContainer,
} from "../src/di/container";
import { Project } from "../src/models/project";
import greeterPluginModule from "../../../examples/plugins/plugin-greeter/src/index";
import greeterCliPluginModule from "../../../examples/plugins/plugin-greeter-cli/src/index";
import greeterWebPluginModule from "../../../examples/plugins/plugin-greeter-web/src/index";

jest.setTimeout(30000);

const templateRoot = path.resolve(
  __dirname,
  "../../../templates/test-templates",
);

const baseUserSettings = {
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
  plugins: {
    greeter: {
      message: "Hello from the test suite!",
    },
  },
};

let tempRoot = "";
let projectParentDir = "";
let uuidSpy: jest.SpiedFunction<typeof crypto.randomUUID> | undefined;
let previousEnv: Record<string, string | undefined> = {};

function toSafeName(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

async function createDeterministicTempDir(name: string): Promise<string> {
  const dir = path.join(os.tmpdir(), "skaff-lib-integration", toSafeName(name));
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function setupTestEnvironment(testName: string): Promise<void> {
  tempRoot = await createDeterministicTempDir(testName);
  projectParentDir = path.join(tempRoot, "projects");
  const configDir = path.join(tempRoot, "config");
  const cacheDir = path.join(tempRoot, "cache");

  await fs.mkdir(projectParentDir, { recursive: true });
  await fs.mkdir(configDir, { recursive: true });
  await fs.mkdir(cacheDir, { recursive: true });

  previousEnv = {
    SKAFF_CONFIG_PATH: process.env.SKAFF_CONFIG_PATH,
    TEMPLATE_DIR_PATHS: process.env.TEMPLATE_DIR_PATHS,
    SKAFF_CACHE_PATH: process.env.SKAFF_CACHE_PATH,
    SKAFF_DEV_TEMPLATES: process.env.SKAFF_DEV_TEMPLATES,
  };

  process.env.SKAFF_CONFIG_PATH = configDir;
  process.env.TEMPLATE_DIR_PATHS = templateRoot;
  process.env.SKAFF_CACHE_PATH = cacheDir;
  process.env.SKAFF_DEV_TEMPLATES = "1";
}

function restoreEnvironment(): void {
  process.env.SKAFF_CONFIG_PATH = previousEnv.SKAFF_CONFIG_PATH;
  process.env.TEMPLATE_DIR_PATHS = previousEnv.TEMPLATE_DIR_PATHS;
  process.env.SKAFF_CACHE_PATH = previousEnv.SKAFF_CACHE_PATH;
  process.env.SKAFF_DEV_TEMPLATES = previousEnv.SKAFF_DEV_TEMPLATES;
}

function registerLocalPlugins(): void {
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

  registerPluginModules([
    {
      moduleExports: greeterPluginModule,
      sandboxedExports: greeterPluginModule,
      modulePath: path.resolve(
        __dirname,
        "../../../examples/plugins/plugin-greeter/src/index.ts",
      ),
      packageName: "@timonteutelink/skaff-plugin-greeter",
    },
    {
      moduleExports: greeterCliModule,
      sandboxedExports: greeterCliModule,
      modulePath: path.resolve(
        __dirname,
        "../../../examples/plugins/plugin-greeter-cli/src/index.ts",
      ),
      packageName: "@timonteutelink/skaff-plugin-greeter-cli",
    },
    {
      moduleExports: greeterWebModule,
      sandboxedExports: greeterWebModule,
      modulePath: path.resolve(
        __dirname,
        "../../../examples/plugins/plugin-greeter-web/src/index.tsx",
      ),
      packageName: "@timonteutelink/skaff-plugin-greeter-web",
    },
  ]);
}

beforeEach(async () => {
  const testName = expect.getState().currentTestName ?? "integration-test";
  await setupTestEnvironment(testName);

  const container = createDefaultContainer();
  setSkaffContainer(container);

  registerLocalPlugins();

  const deterministicUuids = [
    "00000000-0000-4000-8000-000000000001",
    "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003",
    "00000000-0000-4000-8000-000000000004",
  ];
  let uuidIndex = 0;
  uuidSpy = jest
    .spyOn(crypto, "randomUUID")
    .mockImplementation(() => deterministicUuids[uuidIndex++] ?? deterministicUuids[0]!);
});

afterEach(async () => {
  uuidSpy?.mockRestore();
  clearRegisteredPluginModules();
  resetSkaffContainer();
  restoreEnvironment();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe("instantiate actions integration", () => {
  it("generates a project with plugin settings and persisted template settings", async () => {
    const result = await generateNewProject(
      "integration-project",
      "test_template",
      projectParentDir,
      baseUserSettings,
      { git: true },
    );

    expect("error" in result).toBe(false);

    const projectDir = path.join(projectParentDir, "integration-project");
    const readmeContents = await fs.readFile(
      path.join(projectDir, "README.md"),
      "utf8",
    );
    expect(readmeContents.trim()).toBe(
      "Whats 9 + 10?\n\n# This is a nice template",
    );

    const niceContents = await fs.readFile(
      path.join(projectDir, "otherlocation", "nice.txt"),
      "utf8",
    );
    expect(niceContents.trim()).toBe(
      "The answer to &#x27;Whats 9 + 10?&#x27; is **21**",
    );

    const settings = JSON.parse(
      await fs.readFile(path.join(projectDir, "templateSettings.json"), "utf8"),
    ) as {
      instantiatedTemplates: Array<{
        templateName: string;
        templateSettings: Record<string, unknown>;
        automaticallyInstantiatedByParent?: boolean;
      }>;
    };

    const rootInstance = settings.instantiatedTemplates.find(
      (template) => template.templateName === "test_template",
    );
    expect(rootInstance?.templateSettings).toMatchObject({
      plugins: { greeter: { message: "Hello from the test suite!" } },
    });

    const autoChild = settings.instantiatedTemplates.find(
      (template) => template.templateName === "test_stuff",
    );
    expect(autoChild?.automaticallyInstantiatedByParent).toBe(true);
  });

  it("applies modification diffs generated from updated template settings", async () => {
    const creationResult = await generateNewProject(
      "diff-project",
      "test_template",
      projectParentDir,
      baseUserSettings,
      { git: true },
    );

    expect("error" in creationResult).toBe(false);

    const projectDir = path.join(projectParentDir, "diff-project");
    const projectResult = await Project.create(projectDir);
    if ("error" in projectResult) {
      throw new Error(projectResult.error);
    }

    const project = projectResult.data;
    const rootInstanceId = project.instantiatedProjectSettings.instantiatedTemplates[0]?.id;
    if (!rootInstanceId) {
      throw new Error("Root template instance was not persisted.");
    }

    const updatedSettings = {
      ...baseUserSettings,
      test_boolean: false,
      test_string: "Updated string",
    };

    const diffResult = await prepareModificationDiff(
      updatedSettings,
      project,
      rootInstanceId,
    );

    if ("error" in diffResult) {
      throw new Error(diffResult.error);
    }

    expect(diffResult.data.parsedDiff.map((file) => file.path)).toEqual(
      expect.arrayContaining(["README.md", "otherlocation/nice.txt", "templateSettings.json"]),
    );

    const planner = resolveProjectDiffPlanner();
    const applyResult = await planner.applyDiffToProject(
      project,
      diffResult.data.diffHash,
    );

    if ("error" in applyResult) {
      throw new Error(applyResult.error);
    }

    const updatedReadme = await fs.readFile(
      path.join(projectDir, "README.md"),
      "utf8",
    );
    expect(updatedReadme.trim()).toBe(
      "Updated string\n\n# This is a not nice template",
    );

    const updatedNice = await fs.readFile(
      path.join(projectDir, "otherlocation", "nice.txt"),
      "utf8",
    );
    expect(updatedNice.trim()).toBe(
      "The answer to &#x27;Whats 9 + 10?&#x27; is **42**",
    );

    const updatedSettingsFile = JSON.parse(
      await fs.readFile(path.join(projectDir, "templateSettings.json"), "utf8"),
    ) as {
      instantiatedTemplates: Array<{ templateName: string; templateSettings: Record<string, unknown> }>;
    };

    const updatedRoot = updatedSettingsFile.instantiatedTemplates.find(
      (template) => template.templateName === "test_template",
    );
    expect(updatedRoot?.templateSettings).toMatchObject({
      test_boolean: false,
      test_string: "Updated string",
      plugins: { greeter: { message: "Hello from the test suite!" } },
    });
  });

  it("fails when required plugin settings are missing", async () => {
    const invalidSettings = {
      ...baseUserSettings,
      plugins: { greeter: {} },
    };

    const result = await generateNewProject(
      "invalid-project",
      "test_template",
      projectParentDir,
      invalidSettings,
      { git: true },
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("Missing required plugin settings");
      expect(result.error).toContain("greeter");
      expect(result.error).toContain("message");
    }
  });
});
