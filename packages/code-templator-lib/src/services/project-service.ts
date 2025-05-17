import {
  TemplateSettingsType,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import path from "node:path";
import { AnyZodObject, z } from "zod";
import { logger } from "../lib/logger";
import {
  ProjectCreationResult,
  ProjectSettings,
  Result
} from "../lib/types";
import { Project } from "../models/project";
import { Template } from "../models/template";
import { getProjectRepository, getRootTemplateRepository } from "../repositories";
import {
  parseGitDiff
} from "./git-service";
import { TemplateGeneratorService } from "./template-generator-service";

export function getParsedUserSettingsWithParentSettings(
  userSettings: UserTemplateSettings,
  currentlyGeneratingTemplate: Template,
  destinationProjectSettings: ProjectSettings,
  currentlyGeneratingTemplateParentInstanceId?: string,
): Result<TemplateSettingsType<AnyZodObject>> {
  const parsedUserSettings =
    currentlyGeneratingTemplate.config.templateSettingsSchema.safeParse(
      userSettings,
    );
  if (!parsedUserSettings?.success) {
    logger.error(
      `Failed to parse user settings: ${parsedUserSettings?.error}`,
    );
    return {
      error: `Failed to parse user settings: ${parsedUserSettings?.error}`,
    };
  }
  let newUserSettings: TemplateSettingsType<z.AnyZodObject> = {
    ...parsedUserSettings.data,
    project_name: destinationProjectSettings.projectName,
  } as TemplateSettingsType<z.AnyZodObject>;

  if (
    currentlyGeneratingTemplate?.parentTemplate &&
    currentlyGeneratingTemplateParentInstanceId
  ) {
    const newInstantiatedSettings = Project.getInstantiatedSettings(
      currentlyGeneratingTemplate.parentTemplate,
      currentlyGeneratingTemplateParentInstanceId,
      destinationProjectSettings,
    );

    if ("error" in newInstantiatedSettings) {
      return newInstantiatedSettings;
    }

    newUserSettings = {
      ...newUserSettings,
      ...newInstantiatedSettings.data,
    };
  }
  return { data: newUserSettings };
}

export async function instantiateProject(
  rootTemplateName: string,
  parentDirPath: string,
  newProjectName: string,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<ProjectCreationResult>> {
  const template = await (await getRootTemplateRepository()).findDefaultTemplate(rootTemplateName);

  if ("error" in template) {
    return template;
  }

  if (!template.data) {
    logger.error(`Root template not found: ${rootTemplateName}`);
    return { error: "Root template not found" };
  }

  const instantiationResult = await template.data.instantiateNewProject(
    userTemplateSettings,
    parentDirPath,
    newProjectName,
  );

  if ("error" in instantiationResult) {
    return instantiationResult;
  }

  const reloadResult = await (await getProjectRepository()).reloadProjects();

  if ("error" in reloadResult) {
    return reloadResult;
  }

  const project = await (await getProjectRepository()).findProject(newProjectName);

  if ("error" in project) {
    return project;
  }

  if (!project.data) {
    logger.error(`Project ${newProjectName} not found after creation`);
    return {
      error: "Failed to create project, project not found after creation",
    };
  }

  const processedDiff = parseGitDiff(instantiationResult.data.diff);

  const projectDTO = project.data.mapToDTO();

  if ("error" in projectDTO) {
    return projectDTO
  }

  return { data: { newProject: projectDTO.data, diff: processedDiff } };
}

export async function generateProjectFromExistingProject(
  existingProject: Project,
  newProjectPath: string,
): Promise<Result<ProjectCreationResult | string>> {
  return await generateProjectFromTemplateSettings(
    existingProject.instantiatedProjectSettings,
    newProjectPath,
  );
}

/**
 * When git false only returns path to repo
 */
export async function generateProjectFromTemplateSettings(
  projectSettings: ProjectSettings,
  newProjectPath: string,
  git?: boolean
): Promise<Result<ProjectCreationResult | string>> {
  const instantiatedRootTemplate = projectSettings.instantiatedTemplates[0]?.templateCommitHash;

  if (!instantiatedRootTemplate) {
    logger.error(`No instantiated root template commit hash found in project settings`);
    return { error: "No instantiated root template commit hash found in project settings" };
  }

  const rootTemplate = await (await getRootTemplateRepository()).loadRevision(
    projectSettings.rootTemplateName,
    instantiatedRootTemplate,
  );

  if ("error" in rootTemplate) {
    return rootTemplate
  }

  if (!rootTemplate.data) {
    logger.error(
      `Root template not found: ${projectSettings.rootTemplateName}`,
    );
    return { error: "Root template not found" };
  }

  const newProjectGenerator = new TemplateGeneratorService(
    {
      dontDoGit: !git,
      dontAutoInstantiate: true,
      absoluteDestinationPath: newProjectPath,
    },
    rootTemplate.data,
    projectSettings,
  );

  const projectCreationResult = await newProjectGenerator.instantiateFullProjectFromSettings();

  if ("error" in projectCreationResult) {
    return projectCreationResult;
  }

  if (!git) {
    return { data: projectCreationResult.data.resultPath };
  }

  const reloadResult = await (await getProjectRepository()).reloadProjects();

  if ("error" in reloadResult) {
    return reloadResult;
  }

  const newProjectName = path.basename(projectCreationResult.data.resultPath)

  const project = await (await getProjectRepository()).findProject(newProjectName);

  if ("error" in project) {
    return project;
  }

  if (!project.data) {
    logger.error(`Project ${newProjectName} not found after creation`);
    return {
      error: "Failed to create project, project not found after creation",
    };
  }

  const processedDiff = parseGitDiff(projectCreationResult.data.diff);

  const projectDTO = project.data.mapToDTO();

  if ("error" in projectDTO) {
    return projectDTO
  }

  return { data: { newProject: projectDTO.data, diff: processedDiff } };

}

