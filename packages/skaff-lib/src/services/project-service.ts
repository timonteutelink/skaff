import {
  ProjectSettings,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import {
  ProjectCreationOptions,
  ProjectCreationResult,
  Result,
} from "../lib/types";
import { Project } from "../models/project";
import { ProjectLifecycle } from "../core/projects/ProjectLifecycle";

export async function parseProjectCreationResult(
  projectPath: string,
  projectCreationOptions?: ProjectCreationOptions,
): Promise<Result<ProjectCreationResult>> {
  const lifecycle = new ProjectLifecycle(projectCreationOptions);
  return lifecycle.parseCreationResult(projectPath);
}

export async function instantiateProject(
  rootTemplateName: string,
  parentDirPath: string,
  newProjectName: string,
  userTemplateSettings: UserTemplateSettings,
  projectCreationOptions?: ProjectCreationOptions,
): Promise<Result<ProjectCreationResult>> {
  const lifecycle = new ProjectLifecycle(projectCreationOptions);
  return lifecycle.instantiateProject(
    rootTemplateName,
    parentDirPath,
    newProjectName,
    userTemplateSettings,
  );
}

export async function generateProjectFromExistingProject(
  existingProject: Project,
  newProjectPath: string,
  ProjectCreationOptions?: ProjectCreationOptions,
): Promise<Result<ProjectCreationResult>> {
  const lifecycle = new ProjectLifecycle(ProjectCreationOptions);
  return lifecycle.generateFromExistingProject(existingProject, newProjectPath);
}

/**
 * When git false only returns path to repo
 */
export async function generateProjectFromTemplateSettings(
  projectSettings: ProjectSettings,
  newProjectPath: string,
  projectCreationOptions?: ProjectCreationOptions,
): Promise<Result<ProjectCreationResult>> {
  const lifecycle = new ProjectLifecycle(projectCreationOptions);
  return lifecycle.generateFromTemplateSettings(projectSettings, newProjectPath);
}
