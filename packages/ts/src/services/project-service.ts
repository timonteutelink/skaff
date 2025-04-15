import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import path from "node:path";
import { NewTemplateDiffResult, ParsedFile, ProjectCreationResult, ProjectSettings, Result } from "../utils/types";
import { addAllAndDiff, applyDiffToGitRepo, diffDirectories, isConflictAfterApply, parseGitDiff } from "./git-service";
import { PROJECT_REGISTRY } from "./project-registry-service";
import { ROOT_TEMPLATE_REGISTRY } from "./root-template-registry-service";
import { TemplateGeneratorService } from "./template-generator-service";
import { pathInCache, retrieveFromCache, saveToCache } from "./cache-service";
import * as fs from "node:fs/promises";
import { createHash } from "node:crypto";


// First step for template instantiation. Takes all params and returns a diff of the changes that would be made to the project if the template was instantiated. This diff doesnt show changes on the real project but from a clean project.
export async function generateNewTemplateDiff(rootTemplateName: string, templateName: string, parentInstanceId: string, destinationProjectName: string, userTemplateSettings: UserTemplateSettings): Promise<Result<NewTemplateDiffResult>> {
  const rootTemplate = await ROOT_TEMPLATE_REGISTRY.findTemplate(rootTemplateName);

  if ("error" in rootTemplate) {
    return { error: rootTemplate.error };
  }

  const template = rootTemplate.data.findSubTemplate(templateName);

  if (!template) {
    return { error: "Template not found" };
  }

  const destinationProject = await PROJECT_REGISTRY.findProject(destinationProjectName);

  if (!destinationProject) {
    return { error: "Destination project not found" };
  }

  const tempOldProjectName = `${destinationProjectName}-${crypto.randomUUID()}`;
  const tempNewProjectName = `${destinationProjectName}-${crypto.randomUUID()}`;

  const tempCleanProjectOldSettingsPath = await pathInCache(tempOldProjectName);
  const tempCleanProjectNewSettingsPath = await pathInCache(tempNewProjectName);
  try {
    const cleanProjectFromCurrentProjectSettingsResult = await generateProjectFromTemplateSettings(
      destinationProject.instantiatedProjectSettings,
      tempOldProjectName,
      tempCleanProjectOldSettingsPath,
    );

    const newProjectSettings: ProjectSettings = {//TODO add autoInstantiated templates
      ...destinationProject.instantiatedProjectSettings,
      instantiatedTemplates: [
        ...destinationProject.instantiatedProjectSettings.instantiatedTemplates,
        {
          id: crypto.randomUUID(),
          parentId: parentInstanceId,
          templateName: template.config.templateConfig.name,
          templateSettings: userTemplateSettings,
        },
      ],
    };

    const cleanProjectFromNewSettingsResult = await generateProjectFromTemplateSettings(
      newProjectSettings,
      tempNewProjectName,
      tempCleanProjectNewSettingsPath,
    );

    if ("error" in cleanProjectFromCurrentProjectSettingsResult) {
      return { error: cleanProjectFromCurrentProjectSettingsResult.error };
    }

    if ("error" in cleanProjectFromNewSettingsResult) {
      return { error: cleanProjectFromNewSettingsResult.error };
    }

    const cleanProjectFromCurrentProjectSettingsPath = cleanProjectFromCurrentProjectSettingsResult.data;
    const cleanProjectFromNewSettingsPath = cleanProjectFromNewSettingsResult.data;

    const diff = await diffDirectories(cleanProjectFromCurrentProjectSettingsPath, cleanProjectFromNewSettingsPath);

    if (!diff) {
      return { error: "Failed to generate diff" };
    }

    const diffHash = createHash("sha256").update(diff).digest("hex");

    await saveToCache('new-template-diff', diffHash, '.patch', diff); // just save here temporarely so hash can be key for retrieving and applying diff later.

    const parsedDiff = parseGitDiff(diff);

    return {
      data: {
        diffHash,
        parsedDiff,
      },
    };
  } catch (e) {
    console.error(e);
    return { error: "Failed to create clean project from current project settings" };
  } finally {
    await fs.rm(tempCleanProjectOldSettingsPath, { recursive: true });
    await fs.rm(tempCleanProjectNewSettingsPath, { recursive: true });
  }
}

export async function resolveConflictsAndRetrieveAppliedDiff(projectName: string): Promise<Result<ParsedFile[]>> {
  const project = await PROJECT_REGISTRY.findProject(projectName);
  if (!project) {
    return { error: "Project not found" };
  }

  const addAllResult = await addAllAndDiff(project.absoluteRootDir);

  if (!addAllResult) {
    return { error: "Failed to add all and generate diff" };
  }

  return { data: parseGitDiff(addAllResult) };
}

export async function applyDiffToProject(projectName: string, diffHash: string): Promise<Result<ParsedFile[] | { resolveBeforeContinuing: true }>> {
  const project = await PROJECT_REGISTRY.findProject(projectName);

  if (!project) {
    return { error: "Project not found" };
  }

  const diff = await retrieveFromCache('new-template-diff', diffHash, '.patch');

  if (!diff) {
    return { error: "Diff not found" };
  }

  const applyResult = await applyDiffToGitRepo(project.absoluteRootDir, diff.path);

  if (!applyResult) {
    return { error: "Failed to apply diff" };
  }

  // check if there are any merge conflicts and notify user. Then user will press button("Conflicts Resolved") to add all after he has manually resolved the conflicts. Otherwise here we automatically add all and diff.
  if (await isConflictAfterApply(project.absoluteRootDir)) {
    return { data: { resolveBeforeContinuing: true } };
  }

  const addAllResult = await addAllAndDiff(project.absoluteRootDir);

  if (!addAllResult) {
    return { error: "Failed to add all and generate diff" };
  }

  return { data: parseGitDiff(addAllResult) };
}

export async function instantiateProject(rootTemplateName: string, parentDirPath: string, projectName: string, userTemplateSettings: UserTemplateSettings): Promise<Result<ProjectCreationResult>> {
  const template = await ROOT_TEMPLATE_REGISTRY.findTemplate(rootTemplateName);

  if ("error" in template) {
    return { error: template.error };
  }

  const instatiationResult = await template.data.instantiateNewProject(
    userTemplateSettings,
    parentDirPath,
    projectName,
  );

  if ("error" in instatiationResult) {
    return { error: "Failed to create project, " + instatiationResult.error };
  }

  await PROJECT_REGISTRY.reloadProjects();

  const project = await PROJECT_REGISTRY.findProject(projectName);

  if (!project) {
    return { error: "Failed to create project, project not found after creation" };
  }

  const processedDiff = parseGitDiff(instatiationResult.data.diff);

  return { data: { newProject: project.mapToDTO(), diff: processedDiff } };
}

export async function generateProjectFromExistingProject(existingProjectName: string, newProjectName: string, destinationDirPath: string): Promise<Result<string>> {
  const project = await PROJECT_REGISTRY.findProject(existingProjectName);
  if (!project) {
    return { error: "Project not found" };
  }
  const templateSettings = project.instantiatedProjectSettings;

  return await generateProjectFromTemplateSettings(templateSettings, newProjectName, destinationDirPath);
}

// Will be used manually by user and when generating diff for adding template to project
export async function generateProjectFromTemplateSettings(projectSettings: ProjectSettings, newProjectName: string, destinationDirPath: string): Promise<Result<string>> {
  const rootTemplate = await ROOT_TEMPLATE_REGISTRY.findTemplate(projectSettings.rootTemplateName);

  if ("error" in rootTemplate) {
    return { error: rootTemplate.error };
  }

  const newProjectPath = path.join(destinationDirPath, newProjectName);

  const newProjectGenerator = new TemplateGeneratorService(
    {
      mode: 'standalone', absoluteDestinationPath: newProjectPath,
    },
    rootTemplate.data,
  );

  const instatiationResult = await newProjectGenerator.instantiateFullProjectFromSettings(projectSettings);

  if ("error" in instatiationResult) {
    return { error: instatiationResult.error };
  }

  return { data: newProjectPath };
}
