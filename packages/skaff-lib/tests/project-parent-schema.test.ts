import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "@jest/globals";
import z from "zod";

import type {
  ProjectSettings,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import type { GenericTemplateConfigModule } from "../src/lib/types";

jest.mock("../src/lib/logger", () => ({
  backendLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  },
}));

jest.mock("../src/core/infra/git-service", () => ({
  GitService: class {},
  resolveGitService: () => ({
    isGitRepo: async () => ({ data: true }),
    isGitRepoClean: async () => ({ data: true }),
    getCommitHash: async () => ({ data: "hash" }),
    getCurrentBranch: async () => ({ data: "main" }),
    getRemoteCommitHash: async () => ({ data: "hash" }),
    addAllAndRetrieveDiff: async () => ({ data: "" }),
    parseGitDiff: () => [],
    resetAllChanges: async () => ({ data: undefined }),
    deleteRepo: async () => ({ data: undefined }),
  }),
}));

jest.mock("../src/core/diffing/DiffCache", () => ({
  DiffCache: class {},
  resolveDiffCache: () => ({
    getNewTemplateDiff: async () => ({ data: null }),
    getModifyTemplateDiff: async () => ({ data: null }),
    getUpdateTemplateDiff: async () => ({ data: null }),
    saveNewTemplateDiff: async () => ({ data: undefined }),
    saveModifyTemplateDiff: async () => ({ data: undefined }),
    saveUpdateTemplateDiff: async () => ({ data: undefined }),
  }),
}));

const mockProjectCreationManager = {
  parseCreationResult: jest.fn(),
  instantiateProject: jest.fn(),
  generateFromExistingProject: jest.fn(),
  generateFromTemplateSettings: jest.fn(),
};

jest.mock("../src/core/projects/ProjectCreationManager", () => ({
  ProjectCreationManager: class {},
  resolveProjectCreationManager: () => mockProjectCreationManager,
}));

const { Project } =
  require("../src/models/project") as typeof import("../src/models/project");
const { Template } =
  require("../src/core/templates/Template") as typeof import("../src/core/templates/Template");

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length) {
    await cleanups.pop()!();
  }
});

async function createTemplate({
  name,
  schema,
  absoluteBaseDir,
}: {
  name: string;
  schema: z.ZodObject<UserTemplateSettings>;
  absoluteBaseDir: string;
}): Promise<Template> {
  const absoluteDir = path.join(absoluteBaseDir, name);
  const filesDir = path.join(absoluteDir, "files");
  await fs.mkdir(filesDir, { recursive: true });

  const config: GenericTemplateConfigModule = {
    templateConfig: {
      name,
      author: "Test",
      specVersion: "0.0.1",
    },
    templateSettingsSchema: schema,
    templateFinalSettingsSchema: schema,
    mapFinalSettings: ({ templateSettings }) => templateSettings,
  } as GenericTemplateConfigModule;

  return new Template({
    config,
    absoluteBaseDir,
    absoluteDir,
    absoluteFilesDir: filesDir,
  });
}

describe("Project parent final settings validation", () => {
  function buildProjectSettings(
    parentName: string,
    parentValue: string,
  ): ProjectSettings {
    return {
      projectRepositoryName: "test-project",
      projectAuthor: "tester",
      rootTemplateName: parentName,
      instantiatedTemplates: [
        {
          id: "parent-id",
          templateName: parentName,
          templateSettings: { parentValue },
        },
      ],
    };
  }

  async function setupTemplates() {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "parent-"));
    const childBaseDir = await fs.mkdtemp(path.join(os.tmpdir(), "child-"));

    cleanups.push(async () => {
      await fs.rm(baseDir, { recursive: true, force: true });
      await fs.rm(childBaseDir, { recursive: true, force: true });
    });

    const parentSchema = z.object({ parentValue: z.string() });
    const parent = await createTemplate({
      name: "parent-template",
      schema: parentSchema,
      absoluteBaseDir: baseDir,
    });

    const child = await createTemplate({
      name: "child-template",
      schema: z.object({ label: z.string() }),
      absoluteBaseDir: baseDir,
    });

    parent.subTemplates["child"] = [child];
    child.parentTemplate = parent;

    return { parent, child, childBaseDir };
  }

  it("prevents using cross-repo child without schema", async () => {
    const { parent, child, childBaseDir } = await setupTemplates();

    child.absoluteBaseDir = childBaseDir;

    const projectSettings = buildProjectSettings(
      parent.config.templateConfig.name,
      "expected",
    );

    const result = Project.getFinalTemplateSettings(
      child,
      projectSettings,
      { label: "child" },
      "parent-id",
    );

    expect(result).toEqual({
      error: expect.stringContaining("cannot be used as a child"),
    });
  });

  it("validates cross-repo child parent schema", async () => {
    const { parent, child, childBaseDir } = await setupTemplates();

    child.absoluteBaseDir = childBaseDir;
    child.config.parentFinalSettingsSchema = z.object({
      parentValue: z.literal("expected"),
    });

    const projectSettings = buildProjectSettings(
      parent.config.templateConfig.name,
      "expected",
    );

    const success = Project.getFinalTemplateSettings(
      child,
      projectSettings,
      { label: "child" },
      "parent-id",
    );

    expect(success).toEqual({
      data: expect.objectContaining({ label: "child" }),
    });

    const failureSettings = buildProjectSettings(
      parent.config.templateConfig.name,
      "unexpected",
    );

    const failure = Project.getFinalTemplateSettings(
      child,
      failureSettings,
      { label: "child" },
      "parent-id",
    );

    expect(failure).toEqual({
      error: expect.stringContaining("Parent final settings validation failed"),
    });
  });

  it("allows same-repo child without schema", async () => {
    const { parent, child } = await setupTemplates();

    const projectSettings = buildProjectSettings(
      parent.config.templateConfig.name,
      "expected",
    );

    const result = Project.getFinalTemplateSettings(
      child,
      projectSettings,
      { label: "child" },
      "parent-id",
    );

    expect(result).toEqual({
      data: expect.objectContaining({ label: "child" }),
    });
  });
});
