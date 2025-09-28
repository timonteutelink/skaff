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
import { resolveProjectCreationManager } from "./ProjectCreationManager";

export function parseProjectCreationResult(
  projectPath: string,
  projectCreationOptions?: ProjectCreationOptions,
): Promise<Result<ProjectCreationResult>> {
  const manager = resolveProjectCreationManager();
  return manager.parseCreationResult(projectPath, projectCreationOptions);
}

export function instantiateProject(
  rootTemplateName: string,
  parentDirPath: string,
  newProjectName: string,
  userTemplateSettings: UserTemplateSettings,
  projectCreationOptions?: ProjectCreationOptions,
): Promise<Result<ProjectCreationResult>> {
  const manager = resolveProjectCreationManager();
  return manager.instantiateProject(
    rootTemplateName,
    parentDirPath,
    newProjectName,
    userTemplateSettings,
    projectCreationOptions,
  );
}

export function generateProjectFromExistingProject(
  existingProject: Project,
  newProjectPath: string,
  projectCreationOptions?: ProjectCreationOptions,
): Promise<Result<ProjectCreationResult>> {
  const manager = resolveProjectCreationManager();
  return manager.generateFromExistingProject(
    existingProject,
    newProjectPath,
    projectCreationOptions,
  );
}

/**
 * When git false only returns path to repo
 */
export function generateProjectFromTemplateSettings(
  projectSettings: ProjectSettings,
  newProjectPath: string,
  projectCreationOptions?: ProjectCreationOptions,
): Promise<Result<ProjectCreationResult>> {
  const manager = resolveProjectCreationManager();
  return manager.generateFromTemplateSettings(
    projectSettings,
    newProjectPath,
    projectCreationOptions,
  );
}
