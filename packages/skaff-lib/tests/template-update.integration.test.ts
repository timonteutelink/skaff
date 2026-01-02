import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs/promises";
import path from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";

import { generateNewProject } from "../src/actions/instantiate/generate-new-project";
import { prepareUpdateDiff } from "../src/actions/instantiate/prepare-update-diff";
import { resolveProjectDiffPlanner } from "../src/core/diffing/ProjectDiffPlanner";
import { createDefaultContainer, resetSkaffContainer, setSkaffContainer } from "../src/di/container";
import { NpmService } from "../src/core/infra/npm-service";
import { Project } from "../src/models/project";
import { setupIntegrationTestEnvironment } from "./helpers/integration-fixtures";

jest.setTimeout(60000);

const updateUserSettings = {
  greeting: "Hello update",
};

const templateConfigContents = `import z from "zod";
import { TemplateConfig, TemplateConfigModule } from "@timonteutelink/template-types-lib";

const templateSettingsSchema = z.object({
  greeting: z.string().default("Hello from update template"),
});

const templateFinalSettingsSchema = templateSettingsSchema;

const templateConfig: TemplateConfig = {
  name: "update_template",
  description: "Template used to test updates",
  author: "Skaff Test Suite",
  specVersion: "1.0.0",
  isRootTemplate: true,
};

const templateConfigModule: TemplateConfigModule<{}, typeof templateSettingsSchema> = {
  templateConfig,
  targetPath: ".",
  templateSettingsSchema,
  templateFinalSettingsSchema,
  mapFinalSettings: ({ templateSettings }) => ({
    ...templateSettings,
  }),
};

export default templateConfigModule;
`;

async function writeTemplateVersion(
  repoPath: string,
  versionLabel: string,
): Promise<void> {
  const templateDir = path.join(repoPath, "templates", "update-template");
  const filesDir = path.join(templateDir, "files");
  await fs.mkdir(filesDir, { recursive: true });
  await fs.writeFile(
    path.join(templateDir, "templateConfig.ts"),
    templateConfigContents,
    "utf8",
  );
  await fs.writeFile(
    path.join(filesDir, "README.md.hbs"),
    `Version ${versionLabel}: {{greeting}}\n`,
    "utf8",
  );
}

async function createVersionedTemplateRepo(
  repoPath: string,
): Promise<{ git: SimpleGit; baseHash: string; updatedHash: string }> {
  await fs.mkdir(repoPath, { recursive: true });
  const git = simpleGit(repoPath);
  await git.init();
  await git.addConfig("user.email", "test@example.com");
  await git.addConfig("user.name", "Skaff Test");

  await writeTemplateVersion(repoPath, "1");
  await git.add(".");
  await git.commit("Initial template");
  const baseHash = (await git.revparse(["HEAD"])).trim();

  await writeTemplateVersion(repoPath, "2");
  await git.add(".");
  await git.commit("Update template");
  const updatedHash = (await git.revparse(["HEAD"])).trim();

  await git.checkout(baseHash);

  return { git, baseHash, updatedHash };
}

let projectParentDir = "";
let integrationEnvironment:
  | Awaited<ReturnType<typeof setupIntegrationTestEnvironment>>
  | undefined;
let repoInfo:
  | { repoPath: string; baseHash: string; updatedHash: string }
  | undefined;
let npmInstallSpy: jest.SpiedFunction<NpmService["install"]> | undefined;

beforeEach(async () => {
  const testName = expect.getState().currentTestName ?? "update-integration";
  integrationEnvironment = await setupIntegrationTestEnvironment(testName, {
    templateDirPaths: async (tempRoot) => {
      const repoPath = path.join(tempRoot, "template-repo");
      const { baseHash, updatedHash } = await createVersionedTemplateRepo(repoPath);
      repoInfo = { repoPath, baseHash, updatedHash };
      return [repoPath];
    },
  });
  projectParentDir = integrationEnvironment.projectParentDir;

  const container = createDefaultContainer();
  setSkaffContainer(container);

  npmInstallSpy = jest
    .spyOn(NpmService.prototype, "install")
    .mockResolvedValue({ data: undefined });
});

afterEach(async () => {
  npmInstallSpy?.mockRestore();
  resetSkaffContainer();
  if (integrationEnvironment) {
    await integrationEnvironment.cleanup();
    integrationEnvironment = undefined;
  }
  repoInfo = undefined;
});

describe("template update integration", () => {
  it("updates a project when the template revision changes", async () => {
    if (!repoInfo) {
      throw new Error("Template repo was not initialized.");
    }

    const creationResult = await generateNewProject(
      "update-project",
      "update_template",
      projectParentDir,
      updateUserSettings,
      { git: true },
    );

    expect("error" in creationResult).toBe(false);

    const projectDir = path.join(projectParentDir, "update-project");
    const initialReadme = await fs.readFile(
      path.join(projectDir, "README.md"),
      "utf8",
    );
    expect(initialReadme.trim()).toBe("Version 1: Hello update");

    const projectResult = await Project.create(projectDir);
    if ("error" in projectResult) {
      throw new Error(projectResult.error);
    }

    const diffResult = await prepareUpdateDiff(
      projectResult.data,
      repoInfo.updatedHash,
    );

    if ("error" in diffResult) {
      throw new Error(diffResult.error);
    }

    expect(diffResult.data.parsedDiff.map((file) => file.path)).toEqual(
      expect.arrayContaining(["README.md", "templateSettings.json"]),
    );

    const planner = resolveProjectDiffPlanner();
    const applyResult = await planner.applyDiffToProject(
      projectResult.data,
      diffResult.data.diffHash,
    );

    if ("error" in applyResult) {
      throw new Error(applyResult.error);
    }

    const updatedReadme = await fs.readFile(
      path.join(projectDir, "README.md"),
      "utf8",
    );
    expect(updatedReadme.trim()).toBe("Version 2: Hello update");

    const settings = JSON.parse(
      await fs.readFile(path.join(projectDir, "templateSettings.json"), "utf8"),
    ) as {
      instantiatedTemplates: Array<{
        templateName: string;
        templateCommitHash?: string;
      }>;
    };

    const rootInstance = settings.instantiatedTemplates.find(
      (template) => template.templateName === "update_template",
    );
    expect(rootInstance?.templateCommitHash).toBe(repoInfo.updatedHash);
  });
});
