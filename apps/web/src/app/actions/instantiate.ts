"use server";
import { findProject } from "@/lib/server-utils";
import { ensureWebPluginsRegistered } from "@/lib/plugins/register-plugins";
import * as tempLib from "@timonteutelink/skaff-lib";
import { getConfig, NewTemplateDiffResult, ParsedFile, ProjectCreationResult, projectSearchPathKey, Result } from "@timonteutelink/skaff-lib";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";

ensureWebPluginsRegistered();

export async function createNewProject(
  projectRepositoryName: string,
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

  return await tempLib.generateNewProject(projectRepositoryName, templateName, projectDirPath, userTemplateSettings, { git: true });
}

export async function prepareTemplateModificationDiff(
  userTemplateSettings: UserTemplateSettings,
  destinationProjectRepositoryName: string,
  templateInstanceId: string,
): Promise<Result<NewTemplateDiffResult>> {
  const destinationProject = await findProject(destinationProjectRepositoryName);

  if ('error' in destinationProject) {
    return { error: destinationProject.error };
  }

  if (!destinationProject.data) {
    return { error: `Project ${destinationProjectRepositoryName} not found.` };
  }

  return await tempLib.prepareModificationDiff(userTemplateSettings, destinationProject.data, templateInstanceId);
}

export async function prepareTemplateInstantiationDiff(
  rootTemplateName: string,
  templateName: string,
  parentInstanceId: string,
  destinationProjectRepositoryName: string,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<NewTemplateDiffResult>> {
  const destinationProject = await findProject(destinationProjectRepositoryName);

  if ('error' in destinationProject) {
    return { error: destinationProject.error };
  }

  if (!destinationProject.data) {
    return { error: `Project ${destinationProjectRepositoryName} not found.` };
  }

  return await tempLib.prepareInstantiationDiff(
    rootTemplateName,
    templateName,
    parentInstanceId,
    destinationProject.data,
    userTemplateSettings,
  );
}

export async function resolveConflictsAndDiff(
  projectRepositoryName: string,
): Promise<Result<ParsedFile[]>> {
  const project = await findProject(projectRepositoryName);

  if ('error' in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectRepositoryName} not found.` };
  }

  return await tempLib.addAllAndDiff(project.data);
}

export async function restoreAllChangesToCleanProject(
  projectRepositoryName: string,
): Promise<Result<void>> {
  const project = await findProject(projectRepositoryName);

  if ('error' in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectRepositoryName} not found.` };
  }

  return await tempLib.restoreAllChanges(project.data);
}

export async function applyTemplateDiffToProject(
  projectRepositoryName: string,
  diffHash: string,
): Promise<Result<ParsedFile[] | { resolveBeforeContinuing: boolean }>> {
  const project = await findProject(projectRepositoryName);

  if ('error' in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectRepositoryName} not found.` };
  }

  return await tempLib.applyDiff(project.data, diffHash);
}

export async function cancelProjectCreation(
  projectRepositoryName: string,
): Promise<Result<void>> {
  const project = await findProject(projectRepositoryName);

  if ('error' in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectRepositoryName} not found.` };
  }

  return await tempLib.deleteProject(project.data);
}

export async function generateNewProjectFromExisting(
  currentProjectRepositoryName: string,
  newProjectDestinationDirPathId: string,
  newProjectRepositoryName: string,
): Promise<Result<ProjectCreationResult>> {
  const config = await getConfig();
  const currentProject = await findProject(currentProjectRepositoryName);

  if ('error' in currentProject) {
    return { error: currentProject.error };
  }

  if (!currentProject.data) {
    return { error: `Project ${currentProjectRepositoryName} not found.` };
  }

  const newProjectDestinationDirPath = config.PROJECT_SEARCH_PATHS.find(
    (dir) => projectSearchPathKey(dir) === newProjectDestinationDirPathId,
  )

  if (!newProjectDestinationDirPath) {
    return {
      error: `Invalid project directory path ID: ${newProjectDestinationDirPathId}`,
    };
  }
  return await tempLib.generateNewProjectFromExisting(
    currentProject.data,
    newProjectDestinationDirPath,
    newProjectRepositoryName,
    { git: true }
  );
}

export async function retrieveDiffUpdateProjectNewTemplateRevision(
  projectRepositoryName: string,
  newTemplateRevisionCommitHash: string,
  templateInstanceId: string,
): Promise<Result<NewTemplateDiffResult>> {
  const project = await findProject(projectRepositoryName);

  if ('error' in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectRepositoryName} not found.` };
  }

  const targetInstance =
    project.data.instantiatedProjectSettings.instantiatedTemplates.find(
      (inst) => inst.id === templateInstanceId,
    );

  if (!targetInstance) {
    return { error: `Template instance ${templateInstanceId} not found.` };
  }

  return await tempLib.prepareUpdateDiff(
    project.data,
    newTemplateRevisionCommitHash,
    { treeRootTemplateName: targetInstance.templateName },
  );
}

export async function generateProjectFromProjectSettings(
  projectSettingsJson: string,
  projectDirPathId: string,
  newProjectRepositoryDirName: string,
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

  return await tempLib.generateNewProjectFromSettings(
    projectSettingsJson,
    projectDirPath,
    newProjectRepositoryDirName,
    { git: true }
  );
}
