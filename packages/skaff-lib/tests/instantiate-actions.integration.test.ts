import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs/promises";
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
import {
  baseUserSettings,
  registerGreeterPlugins,
  setupIntegrationTestEnvironment,
} from "./helpers/integration-fixtures";

jest.setTimeout(30000);

let projectParentDir = "";
let uuidSpy: jest.SpiedFunction<typeof crypto.randomUUID> | undefined;
let integrationEnvironment:
  | Awaited<ReturnType<typeof setupIntegrationTestEnvironment>>
  | undefined;

beforeEach(async () => {
  const testName = expect.getState().currentTestName ?? "integration-test";
  integrationEnvironment = await setupIntegrationTestEnvironment(testName);
  projectParentDir = integrationEnvironment.projectParentDir;

  const container = createDefaultContainer();
  setSkaffContainer(container);

  registerGreeterPlugins({ includeSandboxedExports: true });

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
  if (integrationEnvironment) {
    await integrationEnvironment.cleanup();
    integrationEnvironment = undefined;
  }
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
