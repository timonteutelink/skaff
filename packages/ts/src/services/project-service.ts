import {
  TemplateSettingsType,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import { AnyZodObject, z } from "zod";
import { Project } from "../models/project-models";
import { Template } from "../models/template-models";
import {
  ProjectCreationResult,
  ProjectSettings,
  Result
} from "../lib/types";
import {
  parseGitDiff
} from "./git-service";
import { PROJECT_REGISTRY } from "./project-registry-service";
import { ROOT_TEMPLATE_REGISTRY } from "./root-template-registry-service";
import { TemplateGeneratorService } from "./template-generator-service";
import { logger } from "../lib/logger";

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
  const template = await ROOT_TEMPLATE_REGISTRY.findDefaultTemplate(rootTemplateName);

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

  const reloadResult = await PROJECT_REGISTRY.reloadProjects();

  if ("error" in reloadResult) {
    return reloadResult;
  }

  const project = await PROJECT_REGISTRY.findProject(newProjectName);

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
): Promise<Result<string>> {
  return await generateProjectFromTemplateSettings(
    existingProject.instantiatedProjectSettings,
    newProjectPath,
  );
}

// TODO: make sure every time a template is retrieved it retrieves the newest one or it retrieves the one with the right commitHash.
export async function generateProjectFromTemplateSettings(
  projectSettings: ProjectSettings,
  newProjectPath: string,
): Promise<Result<string>> {
  const instantiatedRootTemplate = projectSettings.instantiatedTemplates[0]?.templateCommitHash;

  if (!instantiatedRootTemplate) {
    logger.error(`No instantiated root template commit hash found in project settings`);
    return { error: "No instantiated root template commit hash found in project settings" };
  }

  const rootTemplate = await ROOT_TEMPLATE_REGISTRY.loadRevision(
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
      dontDoGit: true,
      dontAutoInstantiate: true,
      absoluteDestinationPath: newProjectPath,
    },
    rootTemplate.data,
    projectSettings,
  );

  const instantiationResult =
    await newProjectGenerator.instantiateFullProjectFromSettings();

  if ("error" in instantiationResult) {
    return instantiationResult;
  }

  return { data: newProjectPath };
}

