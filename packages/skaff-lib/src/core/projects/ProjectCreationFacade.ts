import {
  ProjectSettings,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";

import {
  ProjectCreationOptions,
  ProjectCreationResult,
  Result,
} from "../../lib/types";
import { Project } from "../../models/project";

import { ProjectCreationManager } from "./ProjectCreationManager";

export async function parseProjectCreationResult(
  projectPath: string,
  projectCreationOptions?: ProjectCreationOptions,
): Promise<Result<ProjectCreationResult>> {
  const manager = new ProjectCreationManager(projectCreationOptions);
  return manager.parseCreationResult(projectPath);
}

export async function instantiateProject(
  rootTemplateName: string,
  parentDirPath: string,
  newProjectName: string,
  userTemplateSettings: UserTemplateSettings,
  projectCreationOptions?: ProjectCreationOptions,
): Promise<Result<ProjectCreationResult>> {
  const manager = new ProjectCreationManager(projectCreationOptions);
  return manager.instantiateProject(
    rootTemplateName,
    parentDirPath,
    newProjectName,
    userTemplateSettings,
  );
}

export async function generateProjectFromExistingProject(
  existingProject: Project,
  newProjectPath: string,
  projectCreationOptions?: ProjectCreationOptions,
): Promise<Result<ProjectCreationResult>> {
  const manager = new ProjectCreationManager(projectCreationOptions);
  return manager.generateFromExistingProject(existingProject, newProjectPath);
}

/**
 * When git false only returns path to repo
 */
export async function generateProjectFromTemplateSettings(
  projectSettings: ProjectSettings,
  newProjectPath: string,
  projectCreationOptions?: ProjectCreationOptions,
): Promise<Result<ProjectCreationResult>> {
  const manager = new ProjectCreationManager(projectCreationOptions);
  return manager.generateFromTemplateSettings(projectSettings, newProjectPath);
}
