import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { afterEach, jest } from "@jest/globals";
import {
  FinalTemplateSettings,
  ProjectSettings,
} from "@timonteutelink/template-types-lib";

import { TemplateTreeBuilder } from "../../src/core/templates/TemplateTreeBuilder";
import { Template } from "../../src/core/templates/Template";
import { Project } from "../../src/models/project";
import { GitStatus } from "../../src/lib/types";
import { getSkaffContainer } from "../../src/di/container";

/**
 * Utility helpers for tests that need real template trees and project settings on disk.
 *
 * ```ts
 * import { createTestTemplate, createTestProject } from "../helpers/template-fixtures";
 *
 * describe("my feature", () => {
 *   it("works", async () => {
 *     const { template } = await createTestTemplate({
 *       name: "root-template",
 *       files: { "README.hbs": "Hello {{projectName}}" },
 *       subTemplates: [{ name: "child-template" }],
 *     });
 *
 *     const { project } = await createTestProject({ template });
 *
 *     // run assertions against template + project
 *   });
 * });
 * ```
 *
 * Every helper registers automatic cleanups with Jest so temporary directories
 * and cache locations never leak between tests.
 */

const activeCleanups = new Set<() => Promise<void>>();

afterEach(async () => {
  const cleanups = Array.from(activeCleanups).reverse();
  activeCleanups.clear();
  for (const cleanup of cleanups) {
    await cleanup();
  }
});

function registerCleanup(fn: () => Promise<void>): () => Promise<void> {
  let active = true;
  const wrapped = async () => {
    if (!active) {
      return;
    }
    active = false;
    await fn();
  };
  activeCleanups.add(wrapped);
  return wrapped;
}

function serializeTemplateConfig(
  name: string,
  overrides?: Partial<TemplateModuleOptions["templateConfig"]>,
): string {
  const config = {
    name,
    author: "Test Author",
    description: `${name} test template`,
    specVersion: "0.0.1",
    ...overrides,
  };

  return JSON.stringify(config, null, 2);
}

function buildSchemaSnippet(
  settings?: TemplateModuleOptions["settingsFields"],
): string {
  const fields = settings && Object.keys(settings).length > 0
    ? settings
    : { label: { type: "string", defaultValue: "example" } };

  const lines = Object.entries(fields).map(([key, definition]) => {
    const parts: string[] = [];
    switch (definition.type) {
      case "boolean":
        parts.push("z.boolean()");
        break;
      case "number":
        parts.push("z.number()");
        break;
      default:
        parts.push("z.string()");
        break;
    }
    if (definition.optional) {
      parts.push(".optional()");
    }
    if (definition.defaultValue !== undefined) {
      parts.push(`.default(${JSON.stringify(definition.defaultValue)})`);
    }
    return `  ${JSON.stringify(key)}: ${parts.join("")},`;
  });

  return `const templateSettingsSchema = z.object({\n${lines.join("\n")}\n});`;
}

function buildTemplateModuleContent(options: TemplateModuleOptions): string {
  if (options.templateModule) {
    return options.templateModule;
  }

  const schemaSnippet = buildSchemaSnippet(options.settingsFields);
  const templateConfigSnippet = serializeTemplateConfig(
    options.name,
    options.templateConfig,
  );
  const mapFn = options.mapFinalSettingsBody || "({ templateSettings }) => templateSettings";

  return `import z from "zod";\n\n${schemaSnippet}\n\nconst templateConfig = ${templateConfigSnippet} as const;\n\nexport default {\n  templateConfig,\n  templateSettingsSchema,\n  templateFinalSettingsSchema: templateSettingsSchema,\n  mapFinalSettings: ${mapFn},\n};\n`;
}

async function writeTemplateFiles(
  baseDir: string,
  options: TemplateDefinition,
): Promise<void> {
  const templateDir = path.join(baseDir, options.name);
  await fs.mkdir(templateDir, { recursive: true });

  const templatesDir = path.join(templateDir, "templates");
  await fs.mkdir(templatesDir, { recursive: true });

  const files = options.files && Object.keys(options.files).length > 0
    ? options.files
    : { "index.hbs": `Hello from ${options.name}!` };

  for (const [relativePath, contents] of Object.entries(files)) {
    const destination = path.join(templatesDir, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, contents, "utf8");
  }

  const configPath = path.join(templateDir, "templateConfig.ts");
  const moduleContent = buildTemplateModuleContent({
    name: options.name,
    templateConfig: options.templateConfig,
    settingsFields: options.settingsFields,
    mapFinalSettingsBody: options.mapFinalSettingsBody,
    templateModule: options.templateModule,
  });
  await fs.writeFile(configPath, moduleContent, "utf8");

  for (const subTemplate of options.subTemplates ?? []) {
    await writeTemplateFiles(templateDir, subTemplate);
  }
}

async function mockGitService(): Promise<() => void> {
  const gitService = await import("../../src/core/infra/git-service");

  const repoCleanSpy = jest
    .spyOn(gitService, "isGitRepoClean")
    .mockResolvedValue({ data: true });
  const commitSpy = jest
    .spyOn(gitService, "getCommitHash")
    .mockResolvedValue({ data: "test-commit" });
  const branchSpy = jest
    .spyOn(gitService, "getCurrentBranch")
    .mockResolvedValue({ data: "main" });

  return () => {
    repoCleanSpy.mockRestore();
    commitSpy.mockRestore();
    branchSpy.mockRestore();
  };
}

function applyCacheIsolation(cacheBaseDir: string): () => void {
  const previousCachePath = process.env.SKAFF_CACHE_PATH;
  const cacheDir = path.join(cacheBaseDir, ".skaff-cache");
  process.env.SKAFF_CACHE_PATH = cacheDir;

  return () => {
    if (previousCachePath === undefined) {
      delete process.env.SKAFF_CACHE_PATH;
    } else {
      process.env.SKAFF_CACHE_PATH = previousCachePath;
    }
  };
}

async function removeDirectory(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

export interface TemplateSettingsFieldDefinition {
  type: "string" | "boolean" | "number";
  defaultValue?: string | number | boolean;
  optional?: boolean;
}

interface TemplateModuleOptions {
  name: string;
  templateConfig?: Partial<{
    name: string;
    author: string;
    description?: string;
    specVersion: string;
    multiInstance?: boolean;
  }>;
  settingsFields?: Record<string, TemplateSettingsFieldDefinition>;
  mapFinalSettingsBody?: string;
  templateModule?: string;
}

export interface TemplateDefinition {
  name: string;
  files?: Record<string, string>;
  templateConfig?: TemplateModuleOptions["templateConfig"];
  settingsFields?: TemplateModuleOptions["settingsFields"];
  mapFinalSettingsBody?: string;
  templateModule?: string;
  subTemplates?: TemplateDefinition[];
}

export interface CreateTestTemplateOptions extends TemplateDefinition {}

export interface CreateTestTemplateResult {
  template: Template;
  templateRootDir: string;
  cleanup: () => Promise<void>;
}

export async function createTestTemplate(
  options: CreateTestTemplateOptions,
): Promise<CreateTestTemplateResult> {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "skaff-template-"),
  );

  const restoreCachePath = applyCacheIsolation(tempRoot);
  const restoreGitMocks = await mockGitService();

  await writeTemplateFiles(tempRoot, options);

  const templateDir = path.join(tempRoot, options.name);
  const templateTreeBuilder = getSkaffContainer().resolve(TemplateTreeBuilder);
  const buildResult = await templateTreeBuilder.build(templateDir);
  if ("error" in buildResult) {
    restoreGitMocks();
    restoreCachePath();
    await removeDirectory(tempRoot);
    throw new Error(`Failed to build test template: ${buildResult.error}`);
  }

  const cleanup = registerCleanup(async () => {
    restoreGitMocks();
    restoreCachePath();
    await removeDirectory(tempRoot);
  });

  return {
    template: buildResult.data,
    templateRootDir: templateDir,
    cleanup,
  };
}

export interface CreateTestProjectOptions {
  template: Template;
  projectName?: string;
  projectAuthor?: string;
  instantiatedTemplates?: ProjectSettings["instantiatedTemplates"];
  settingsOverrides?: Partial<ProjectSettings>;
  gitStatus?: GitStatus;
  outdatedTemplate?: boolean;
  files?: Record<string, string>;
}

export interface CreateTestProjectResult {
  project: Project;
  projectDir: string;
  settingsPath: string;
  settings: ProjectSettings;
  cleanup: () => Promise<void>;
}

export async function createTestProject(
  options: CreateTestProjectOptions,
): Promise<CreateTestProjectResult> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skaff-project-"));
  const projectDir = path.join(tempRoot, options.projectName ?? "test-project");
  await fs.mkdir(projectDir, { recursive: true });

  const baseSettings: ProjectSettings = {
    projectName: options.projectName ?? "test-project",
    projectAuthor: options.projectAuthor ?? "Test Author",
    rootTemplateName: options.template.config.templateConfig.name,
    instantiatedTemplates: options.instantiatedTemplates ?? [],
  };

  const settings: ProjectSettings = {
    ...baseSettings,
    ...options.settingsOverrides,
    instantiatedTemplates:
      options.settingsOverrides?.instantiatedTemplates ??
      baseSettings.instantiatedTemplates,
  };

  const settingsPath = path.join(projectDir, "templateSettings.json");
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");

  for (const [relativePath, contents] of Object.entries(options.files ?? {})) {
    const destination = path.join(projectDir, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, contents, "utf8");
  }

  const project = new Project(
    projectDir,
    settingsPath,
    settings,
    options.template,
    options.gitStatus,
    options.outdatedTemplate,
  );

  const cleanup = registerCleanup(async () => {
    await removeDirectory(tempRoot);
  });

  return {
    project,
    projectDir,
    settingsPath,
    settings,
    cleanup,
  };
}

export interface TemplateAndProjectFixtures {
  template: Template;
  project: Project;
  projectDir: string;
  settingsPath: string;
  cleanup: () => Promise<void>;
  templateRootDir: string;
}

export async function createTemplateAndProject(
  templateOptions: CreateTestTemplateOptions,
  projectOptions: Omit<CreateTestProjectOptions, "template"> = {},
): Promise<TemplateAndProjectFixtures> {
  const templateResult = await createTestTemplate(templateOptions);
  const projectResult = await createTestProject({
    ...projectOptions,
    template: templateResult.template,
  });

  const cleanup = registerCleanup(async () => {
    await templateResult.cleanup();
    await projectResult.cleanup();
  });

  return {
    template: templateResult.template,
    project: projectResult.project,
    projectDir: projectResult.projectDir,
    settingsPath: projectResult.settingsPath,
    cleanup,
    templateRootDir: templateResult.templateRootDir,
  };
}

export type TestTemplateFinalizer = (
  ctx: {
    template: Template;
    project: Project;
    settings: ProjectSettings;
  },
) => FinalTemplateSettings | Promise<FinalTemplateSettings>;

export async function mapFinalSettings(
  template: Template,
  settings: ProjectSettings,
  instanceId: string,
): Promise<FinalTemplateSettings> {
  const templateSettings = settings.instantiatedTemplates.find(
    (item) =>
      item.templateName === template.config.templateConfig.name &&
      item.id === instanceId,
  );

  if (!templateSettings) {
    throw new Error(
      `Template ${template.config.templateConfig.name} with id ${instanceId} not found`,
    );
  }

  const result = Template.getFinalTemplateSettingsForInstantiatedTemplate(
    template,
    instanceId,
    settings,
  );

  if ("error" in result) {
    throw new Error(result.error);
  }

  return result.data;
}

