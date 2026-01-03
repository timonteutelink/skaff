import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs/promises";
import path from "node:path";
import * as crypto from "node:crypto";

import { generateNewProject } from "../src/actions/instantiate/generate-new-project";
import { prepareInstantiationDiff } from "../src/actions/instantiate/prepare-instantiation-diff";
import { prepareModificationDiff } from "../src/actions/instantiate/prepare-modification-diff";
import { resolveProjectDiffPlanner } from "../src/core/diffing/ProjectDiffPlanner";
import { clearRegisteredPluginModules } from "../src/core/plugins";
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

const buildSettings = (
  overrides: Partial<typeof baseUserSettings> & {
    test_object?: Partial<typeof baseUserSettings.test_object>;
  } = {},
) => ({
  ...baseUserSettings,
  ...overrides,
  test_object: {
    ...baseUserSettings.test_object,
    ...(overrides.test_object ?? {}),
  },
});

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
  it("generates a project and persists template settings", async () => {
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
      test_boolean: true,
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
      "Updated string\n\n# This is a nice template",
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
      test_boolean: true,
      test_string: "Updated string",
    });
  });

  it("renders helper output and executes template commands", async () => {
    const result = await generateNewProject(
      "helper-project",
      "test_template",
      projectParentDir,
      baseUserSettings,
      { git: true },
    );

    expect("error" in result).toBe(false);

    const projectDir = path.join(projectParentDir, "helper-project");
    const coolifiedContents = await fs.readFile(
      path.join(projectDir, "testlocation", "coolified.txt"),
      "utf8",
    );
    expect(coolifiedContents.trim()).toBe("WhAtS 9 + 10?");

    const projectResult = await Project.create(projectDir);
    if ("error" in projectResult) {
      throw new Error(projectResult.error);
    }

    const project = projectResult.data;
    const rootInstanceId =
      project.instantiatedProjectSettings.instantiatedTemplates[0]?.id;
    if (!rootInstanceId) {
      throw new Error("Root template instance was not persisted.");
    }

    const commandResult = await project.executeTemplateCommand(
      rootInstanceId,
      "Test Command",
    );

    expect(commandResult).toEqual({ data: "This is a test command" });
  });

  it("auto-instantiates nested subtemplates", async () => {
    const result = await generateNewProject(
      "nested-project",
      "test_template",
      projectParentDir,
      baseUserSettings,
      { git: true },
    );

    expect("error" in result).toBe(false);

    const projectDir = path.join(projectParentDir, "nested-project");
    const nestedContents = await fs.readFile(
      path.join(projectDir, "otherlocation", "nested", "nested.txt"),
      "utf8",
    );
    expect(nestedContents.trim()).toBe(
      "Nested subtemplate: The answer to &#x27;Whats 9 + 10?&#x27; is **21**",
    );

    const settings = JSON.parse(
      await fs.readFile(path.join(projectDir, "templateSettings.json"), "utf8"),
    ) as {
      instantiatedTemplates: Array<{
        templateName: string;
        automaticallyInstantiatedByParent?: boolean;
      }>;
    };

    const autoChild = settings.instantiatedTemplates.find(
      (template) => template.templateName === "test_stuff",
    );
    expect(autoChild?.automaticallyInstantiatedByParent).toBe(true);

    const nestedChild = settings.instantiatedTemplates.find(
      (template) => template.templateName === "test_nested",
    );
    expect(nestedChild?.automaticallyInstantiatedByParent).toBe(true);
  });

  it("instantiates a subtemplate in an existing project", async () => {
    const result = await generateNewProject(
      "manual-subtemplate-project",
      "test_template",
      projectParentDir,
      baseUserSettings,
      { git: true },
    );

    expect("error" in result).toBe(false);

    const projectDir = path.join(projectParentDir, "manual-subtemplate-project");
    const projectResult = await Project.create(projectDir);
    if ("error" in projectResult) {
      throw new Error(projectResult.error);
    }

    const project = projectResult.data;
    const rootInstanceId =
      project.instantiatedProjectSettings.instantiatedTemplates[0]?.id;
    if (!rootInstanceId) {
      throw new Error("Root template instance was not persisted.");
    }

    const manualTemplate = project.rootTemplate.findSubTemplate("test_manual");
    if (!manualTemplate) {
      throw new Error("Manual subtemplate not found.");
    }

    const instantiateResult = await manualTemplate.templateInExistingProject(
      { message: "Manual run" },
      project,
      rootInstanceId,
    );

    expect(instantiateResult).toEqual({
      data: path.join(projectDir, "manual"),
    });

    const manualContents = await fs.readFile(
      path.join(projectDir, "manual", "manual.txt"),
      "utf8",
    );
    expect(manualContents.trim()).toBe("Manual subtemplate says: Manual run");

    const settings = JSON.parse(
      await fs.readFile(path.join(projectDir, "templateSettings.json"), "utf8"),
    ) as {
      instantiatedTemplates: Array<{
        templateName: string;
        templateSettings: Record<string, unknown>;
      }>;
    };

    const manualInstance = settings.instantiatedTemplates.find(
      (template) => template.templateName === "test_manual",
    );
    expect(manualInstance?.templateSettings).toMatchObject({
      message: "Manual run",
    });
  });

  it("adds a subtemplate with nested auto-instantiation via diff", async () => {
    const result = await generateNewProject(
      "add-subtemplate-project",
      "test_template",
      projectParentDir,
      baseUserSettings,
      { git: true },
    );

    expect("error" in result).toBe(false);

    const projectDir = path.join(projectParentDir, "add-subtemplate-project");
    const projectResult = await Project.create(projectDir);
    if ("error" in projectResult) {
      throw new Error(projectResult.error);
    }

    const project = projectResult.data;
    const rootInstanceId =
      project.instantiatedProjectSettings.instantiatedTemplates[0]?.id;
    if (!rootInstanceId) {
      throw new Error("Root template instance was not persisted.");
    }

    const diffResult = await prepareInstantiationDiff(
      project.rootTemplate.config.templateConfig.name,
      "test_add",
      rootInstanceId,
      project,
      { note: "Added from diff" },
    );

    if ("error" in diffResult) {
      throw new Error(diffResult.error);
    }

    expect(diffResult.data.parsedDiff.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        "added/added.txt",
        "added/nested/nested.txt",
        "added/nested/grandchild/grandchild.txt",
        "templateSettings.json",
      ]),
    );

    const planner = resolveProjectDiffPlanner();
    const applyResult = await planner.applyDiffToProject(
      project,
      diffResult.data.diffHash,
    );

    if ("error" in applyResult) {
      throw new Error(applyResult.error);
    }

    const addedContents = await fs.readFile(
      path.join(projectDir, "added", "added.txt"),
      "utf8",
    );
    expect(addedContents.trim()).toBe("Added note: Added from diff");

    const nestedContents = await fs.readFile(
      path.join(projectDir, "added", "nested", "nested.txt"),
      "utf8",
    );
    expect(nestedContents.trim()).toBe("Nested note: Nested: Added from diff");

    const grandchildContents = await fs.readFile(
      path.join(projectDir, "added", "nested", "grandchild", "grandchild.txt"),
      "utf8",
    );
    expect(grandchildContents.trim()).toBe(
      "Grandchild note: Grandchild: Nested: Added from diff",
    );

    const settings = JSON.parse(
      await fs.readFile(path.join(projectDir, "templateSettings.json"), "utf8"),
    ) as {
      instantiatedTemplates: Array<{
        templateName: string;
        automaticallyInstantiatedByParent?: boolean;
        templateSettings: Record<string, unknown>;
      }>;
    };

    const addedInstance = settings.instantiatedTemplates.find(
      (template) => template.templateName === "test_add",
    );
    expect(addedInstance?.templateSettings).toMatchObject({
      note: "Added from diff",
    });
    expect(addedInstance?.automaticallyInstantiatedByParent).toBeUndefined();

    const nestedInstance = settings.instantiatedTemplates.find(
      (template) => template.templateName === "test_add_nested",
    );
    expect(nestedInstance?.automaticallyInstantiatedByParent).toBe(true);

    const grandchildInstance = settings.instantiatedTemplates.find(
      (template) => template.templateName === "test_add_grandchild",
    );
    expect(grandchildInstance?.automaticallyInstantiatedByParent).toBe(true);
  });

  it("fails end-to-end when template assertions do not pass", async () => {
    const invalidSettings = buildSettings({ test_boolean: false });

    const result = await generateNewProject(
      "assertion-project",
      "test_template",
      projectParentDir,
      invalidSettings,
      { git: true },
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("failed assertions");
    }
  });

  it.each([
    {
      name: "test_number min",
      overrides: { test_number: 9 },
      message: ">=10",
    },
    {
      name: "test_number max",
      overrides: { test_number: 101 },
      message: "<=100",
    },
    {
      name: "test_object.test_array min length",
      overrides: {
        test_object: { test_array: [{ test_string_in_array: "banananananana" }] },
      },
      message: ">=2 items",
    },
    {
      name: "test_object.more_stuff enum",
      overrides: {
        test_object: { more_stuff: "option4" },
      },
      message: "Invalid option",
    },
  ])("validates schema constraints: $name", async ({ overrides, message }) => {
    const invalidSettings = buildSettings(overrides);

    const result = await generateNewProject(
      "schema-project",
      "test_template",
      projectParentDir,
      invalidSettings,
      { git: true },
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("Failed to parse user settings");
      expect(result.error).toContain(message);
    }
  });

});
