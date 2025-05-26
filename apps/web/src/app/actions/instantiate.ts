"use server";
import { findProject } from "@/lib/server-utils";
import * as tempLib from "@timonteutelink/code-templator-lib";
import { getConfig, NewTemplateDiffResult, ParsedFile, ProjectCreationResult, projectSearchPathKey, Result } from "@timonteutelink/code-templator-lib";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";

export async function createNewProject(
  projectName: string,
  templateName: string,
  projectDirPathId: string,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<ProjectCreationResult>> {
  const config = await getConfig();

  const projectDirPath = config.PROJECT_SEARCH_PATHS.find(
    (dir) => projectSearchPathKey(dir) === projectDirPathId,
  );

  if (!projectDirPath) {
    return {
      error: `Invalid project directory path ID: ${projectDirPathId}`,
    };
  }

  return tempLib.generateNewProject(projectName, templateName, projectDirPath, userTemplateSettings);
}

export async function prepareTemplateModificationDiff(
  userTemplateSettings: UserTemplateSettings,
  destinationProjectName: string,
  templateInstanceId: string,
): Promise<Result<NewTemplateDiffResult>> {
  const destinationProject = await findProject(destinationProjectName);

  if ('error' in destinationProject) {
    return { error: destinationProject.error };
  }

  if (!destinationProject.data) {
    return { error: `Project ${destinationProjectName} not found.` };
  }

  return tempLib.prepareModificationDiff(userTemplateSettings, destinationProject.data, templateInstanceId);
}

export async function prepareTemplateInstantiationDiff(
  rootTemplateName: string,
  templateName: string,
  parentInstanceId: string,
  destinationProjectName: string,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<NewTemplateDiffResult>> {
  const destinationProject = await findProject(destinationProjectName);

  if ('error' in destinationProject) {
    return { error: destinationProject.error };
  }

  if (!destinationProject.data) {
    return { error: `Project ${destinationProjectName} not found.` };
  }

  return tempLib.prepareInstantiationDiff(
    rootTemplateName,
    templateName,
    parentInstanceId,
    destinationProject.data,
    userTemplateSettings,
  );
}

export async function resolveConflictsAndDiff(
  projectName: string,
): Promise<Result<ParsedFile[]>> {
  const project = await findProject(projectName);

  if ('error' in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectName} not found.` };
  }

  return tempLib.addAllAndDiff(project.data);
}

export async function restoreAllChangesToCleanProject(
  projectName: string,
): Promise<Result<void>> {
  const project = await findProject(projectName);

  if ('error' in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectName} not found.` };
  }

  return tempLib.restoreAllChanges(project.data);
}

export async function applyTemplateDiffToProject(
  projectName: string,
  diffHash: string,
): Promise<Result<ParsedFile[] | { resolveBeforeContinuing: boolean }>> {
  const project = await findProject(projectName);

  if ('error' in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectName} not found.` };
  }

  return tempLib.applyDiff(project.data, diffHash);
}

export async function cancelProjectCreation(
  projectName: string,
): Promise<Result<void>> {
  const project = await findProject(projectName);

  if ('error' in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectName} not found.` };
  }

  return tempLib.deleteProject(project.data);
}

export async function generateNewProjectFromExisting(
  currentProjectName: string,
  newProjectDestinationDirPathId: string,
  newProjectName: string,
): Promise<Result<string>> {
  const config = await getConfig();
  const currentProject = await findProject(currentProjectName);

  if ('error' in currentProject) {
    return { error: currentProject.error };
  }

  if (!currentProject.data) {
    return { error: `Project ${currentProjectName} not found.` };
  }

  const newProjectDestinationDirPath = config.PROJECT_SEARCH_PATHS.find(
    (dir) => projectSearchPathKey(dir) === newProjectDestinationDirPathId,
  )

  if (!newProjectDestinationDirPath) {
    return {
      error: `Invalid project directory path ID: ${newProjectDestinationDirPathId}`,
    };
  }
  return tempLib.generateNewProjectFromExisting(
    currentProject.data,
    newProjectDestinationDirPath,
    newProjectName,
  );
}

export async function retrieveDiffUpdateProjectNewTemplateRevision(
  projectName: string,
  newTemplateRevisionCommitHash: string,
): Promise<Result<NewTemplateDiffResult>> {
  const project = await findProject(projectName);

  if ('error' in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectName} not found.` };
  }

  return tempLib.prepareUpdateDiff(
    project.data,
    newTemplateRevisionCommitHash,
  );
}

export async function generateProjectFromProjectSettings(
  projectSettingsJson: string,
  projectDirPathId: string,
  newProjectDirName: string,
): Promise<Result<ProjectCreationResult>> {
  const config = await getConfig();
  const projectDirPath = config.PROJECT_SEARCH_PATHS.find(
    (dir) => projectSearchPathKey(dir) === projectDirPathId,
  );

  if (!projectDirPath) {
    return {
      error: `Invalid project directory path ID: ${projectDirPathId}`,
    };
  }

  return tempLib.generateNewProjectFromSettings(
    projectSettingsJson,
    projectDirPath,
    newProjectDirName,
  );
}
