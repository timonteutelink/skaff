import { TemplateSettingsType, UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import { AnyZodObject, z } from "zod";
import { Project } from "../models/project-models";
import { Template } from "../models/template-models";
import { NewTemplateDiffResult, ParsedFile, ProjectCreationResult, ProjectSettings, Result } from "../utils/types";
import { stringOrCallbackToString } from "../utils/utils";
import { pathInCache, retrieveFromCache, saveToCache } from "./cache-service";
import { addAllAndDiff, applyDiffToGitRepo, diffDirectories, isConflictAfterApply, parseGitDiff } from "./git-service";
import { PROJECT_REGISTRY } from "./project-registry-service";
import { ROOT_TEMPLATE_REGISTRY } from "./root-template-registry-service";
import { TemplateGeneratorService } from "./template-generator-service";


export function getParsedUserSettingsWithParentSettings(userSettings: UserTemplateSettings, currentlyGeneratingTemplate: Template, projectName: string, currentlyGeneratingTemplateParentInstanceId?: string, destinationProjectSettings?: ProjectSettings): Result<TemplateSettingsType<AnyZodObject>> {
  const parsedUserSettings = currentlyGeneratingTemplate.config.templateSettingsSchema.safeParse(userSettings);
  if (!parsedUserSettings?.success) {
    console.error(
      `Failed to parse user settings: ${parsedUserSettings?.error}`,
    );
    return {
      error: `Failed to parse user settings: ${parsedUserSettings?.error}`,
    }
  }
  let newUserSettings: TemplateSettingsType<z.AnyZodObject> = parsedUserSettings.data as TemplateSettingsType<z.AnyZodObject>;
  if (destinationProjectSettings) {
    newUserSettings = {
      ...newUserSettings,
      project_name:
        destinationProjectSettings.projectName,
    };
    if (
      currentlyGeneratingTemplate?.parentTemplate &&
      currentlyGeneratingTemplateParentInstanceId
    ) {
      newUserSettings = {
        ...newUserSettings,
        ...Project.getInstantiatedSettings(
          currentlyGeneratingTemplate.parentTemplate,
          currentlyGeneratingTemplateParentInstanceId,
          destinationProjectSettings,
        ),
      };
    }
  } else {
    newUserSettings = {
      ...newUserSettings,
      project_name: projectName,
    };
  }
  return { data: newUserSettings };
}

async function addAutoInstantiatedTemplatesToProjectSettings(
  projectSettings: ProjectSettings,
  currentTemplateToAddChildren: Template,
  parentInstanceId: string,
  parentTemplateSettings: UserTemplateSettings,
): Promise<Result<ProjectSettings>> {
  const newFullTemplateSettings = getParsedUserSettingsWithParentSettings(parentTemplateSettings, currentTemplateToAddChildren, parentInstanceId, projectSettings.projectName, projectSettings);
  if ('error' in newFullTemplateSettings) {
    return { error: newFullTemplateSettings.error };
  }

  return recursivelyAddAutoInstantiatedTemplatesToProjectSettings(
    projectSettings,
    currentTemplateToAddChildren,
    parentInstanceId,
    newFullTemplateSettings.data,
  );
}

async function recursivelyAddAutoInstantiatedTemplatesToProjectSettings(
  projectSettings: ProjectSettings,
  currentTemplateToAddChildren: Template,
  parentInstanceId: string,
  fullParentTemplateSettings: TemplateSettingsType<AnyZodObject>,
): Promise<Result<ProjectSettings>> {
  for (const autoInstantiatedTemplate of currentTemplateToAddChildren.config.autoInstatiatedSubtemplates || []) {
    const autoInstantiatedTemplateInstanceId = crypto.randomUUID();
    const newTemplateSettings = autoInstantiatedTemplate.mapSettings(fullParentTemplateSettings);
    const newFullTemplateSettings = Object.assign({}, fullParentTemplateSettings, newTemplateSettings);
    const subTemplateName = stringOrCallbackToString(autoInstantiatedTemplate.subTemplateName, newFullTemplateSettings);

    projectSettings.instantiatedTemplates.push({
      id: autoInstantiatedTemplateInstanceId,
      parentId: parentInstanceId,
      templateName: subTemplateName,
      templateSettings: newTemplateSettings,
      automaticallyInstantiatedByParent: true,
    });

    const rootTemplate = await ROOT_TEMPLATE_REGISTRY.findTemplate(projectSettings.rootTemplateName);

    if ("error" in rootTemplate) {
      return { error: rootTemplate.error };
    }

    const subTemplate = rootTemplate.data.findSubTemplate(subTemplateName);

    if (!subTemplate) {
      return { error: `Subtemplate ${autoInstantiatedTemplate.subTemplateName} not found` };
    }

    const result = await recursivelyAddAutoInstantiatedTemplatesToProjectSettings(projectSettings, subTemplate, autoInstantiatedTemplateInstanceId, newFullTemplateSettings);

    if ("error" in result) {
      return { error: result.error };
    }
    projectSettings = result.data;
  }
  return { data: projectSettings };
}

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

  const tempOldProjectPath = await pathInCache(tempOldProjectName);
  const tempNewProjectPath = await pathInCache(tempNewProjectName);
  try {
    const cleanProjectFromCurrentProjectSettingsResult = await generateProjectFromTemplateSettings(
      destinationProject.instantiatedProjectSettings,
      destinationProjectName,
      tempOldProjectPath,
    );

    const templateInstanceId = crypto.randomUUID();
    const newProjectSettings: ProjectSettings = {//TODO add autoInstantiated templates when autogenerating.
      ...destinationProject.instantiatedProjectSettings,
      instantiatedTemplates: [
        ...destinationProject.instantiatedProjectSettings.instantiatedTemplates,
        {
          id: templateInstanceId,
          parentId: parentInstanceId,
          templateName: template.config.templateConfig.name,
          templateSettings: userTemplateSettings,
        },
      ],
    };

    await addAutoInstantiatedTemplatesToProjectSettings(newProjectSettings, template, templateInstanceId, userTemplateSettings);

    const cleanProjectFromNewSettingsResult = await generateProjectFromTemplateSettings(
      newProjectSettings,
      destinationProjectName,
      tempNewProjectPath,
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

    // When the project settings contains the hash of the entire template we can hash the entire project settings and combine the old and new project settings hashes to create a unique key for retrieving the diff without having to generate all files again.
    await saveToCache('new-template-diff', diffHash, 'patch', diff);

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
    await fs.rm(tempOldProjectPath, { recursive: true });
    await fs.rm(tempNewProjectPath, { recursive: true });
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

  const diff = await retrieveFromCache('new-template-diff', diffHash, 'patch');

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
export async function generateProjectFromTemplateSettings(projectSettings: ProjectSettings, newProjectName: string, newProjectPath: string): Promise<Result<string>> {
  const rootTemplate = await ROOT_TEMPLATE_REGISTRY.findTemplate(projectSettings.rootTemplateName);

  if ("error" in rootTemplate) {
    return { error: rootTemplate.error };
  }

  const newProjectGenerator = new TemplateGeneratorService(
    {
      mode: 'standalone', absoluteDestinationPath: newProjectPath,
    },
    rootTemplate.data,
    newProjectName,
  );

  const instatiationResult = await newProjectGenerator.instantiateFullProjectFromSettings(projectSettings);

  if ("error" in instatiationResult) {
    return { error: instatiationResult.error };
  }

  return { data: newProjectPath };
}
