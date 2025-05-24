"use server";
import * as tempLib from "@timonteutelink/code-templator-lib";
import { NewTemplateDiffResult, ParsedFile, ProjectCreationResult, Result } from "@timonteutelink/code-templator-lib";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";

export async function createNewProject(
  projectName: string,
  templateName: string,
  projectDirPathId: string,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<ProjectCreationResult>> {
  return tempLib.generateNewProject(projectName, templateName, projectDirPathId, userTemplateSettings);
}

export async function prepareTemplateModificationDiff(
  userTemplateSettings: UserTemplateSettings,
  destinationProjectName: string,
  templateInstanceId: string,
): Promise<Result<NewTemplateDiffResult>> {
  return tempLib.prepareModificationDiff(userTemplateSettings, destinationProjectName, templateInstanceId);
}

export async function prepareTemplateInstantiationDiff(
  rootTemplateName: string,
  templateName: string,
  parentInstanceId: string,
  destinationProjectName: string,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<NewTemplateDiffResult>> {
  return tempLib.prepareInstantiationDiff(
    rootTemplateName,
    templateName,
    parentInstanceId,
    destinationProjectName,
    userTemplateSettings,
  );
}

export async function resolveConflictsAndDiff(
  projectName: string,
): Promise<Result<ParsedFile[]>> {
  return tempLib.addAllAndDiff(projectName);
}

export async function restoreAllChangesToCleanProject(
  projectName: string,
): Promise<Result<void>> {
  return tempLib.restoreAllChanges(projectName);
}

export async function applyTemplateDiffToProject(
  projectName: string,
  diffHash: string,
): Promise<Result<ParsedFile[] | { resolveBeforeContinuing: boolean }>> {
  return tempLib.applyDiff(projectName, diffHash);
}

export async function cancelProjectCreation(
  projectName: string,
): Promise<Result<void>> {
  return tempLib.deleteProject(projectName);
}

export async function generateNewProjectFromExisting(
  currentProjectName: string,
  newProjectDestinationDirPathId: string,
  newProjectName: string,
): Promise<Result<string>> {
  return tempLib.generateNewProjectFromExisting(
    currentProjectName,
    newProjectDestinationDirPathId,
    newProjectName,
  );
}

export async function retrieveDiffUpdateProjectNewTemplateRevision(
  projectName: string,
  newTemplateRevisionCommitHash: string,
): Promise<Result<NewTemplateDiffResult>> {
  return tempLib.prepareUpdateDiff(
    projectName,
    newTemplateRevisionCommitHash,
  );
}

export async function generateProjectFromProjectSettings(
  projectSettingsJson: string,
  projectDirPathId: string,
  newProjectDirName: string,
): Promise<Result<ProjectCreationResult>> {
  return tempLib.generateNewProjectFromSettings(
    projectSettingsJson,
    projectDirPathId,
    newProjectDirName,
  );
}
