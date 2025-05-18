"use server";
import {
  deleteRepo,
  resetAllChanges,
} from "@timonteutelink/code-templator-lib/services/git-service";
import {
  applyDiffToProject,
  generateModifyTemplateDiff,
  generateNewTemplateDiff,
  generateUpdateTemplateDiff,
  resolveConflictsAndRetrieveAppliedDiff,
} from "@timonteutelink/code-templator-lib/services/project-diff-service";
import {
  generateProjectFromTemplateSettings,
  instantiateProject,
} from "@timonteutelink/code-templator-lib/services/project-service";
import {
  CreateProjectResult,
  NewTemplateDiffResult,
  ParsedFile,
  ProjectCreationResult,
  ProjectSettings,
  ProjectSettingsSchema,
  Result,
} from "@timonteutelink/code-templator-lib/lib/types";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import path from "node:path";
import { PROJECT_REPOSITORY } from "@timonteutelink/code-templator-lib/repositories/project-repository";
import { logError } from "@timonteutelink/code-templator-lib/lib/utils";

// TODO make sure the templategenerationengine enforces to use the right templatecommithash unless specified otherwise
// TODO fix that changing one character in env vars in turbo_repo generates empty diff.
// TODO fix that env vars are stored inside the autoinstantiated subtemplate instead of the parent template in projectsettings.
export async function createNewProject(
  projectName: string,
  templateName: string,
  projectDirPathId: string,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<ProjectCreationResult>> {
  const reloadResult = await PROJECT_REPOSITORY.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  const parentDirPath = PROJECT_SEARCH_PATHS.find(
    (dir) => dir.id === projectDirPathId,
  )?.path;

  if (!parentDirPath) {
    logError({
      shortMessage: `Invalid project directory path ID: ${projectDirPathId}`,
    });
    return { error: `Invalid project directory path ID: ${projectDirPathId}` };
  }

  const result = await instantiateProject(
    templateName,
    parentDirPath,
    projectName,
    userTemplateSettings,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}

export async function prepareTemplateModificationDiff(
  userTemplateSettings: UserTemplateSettings,
  destinationProjectName: string,
  templateInstanceId: string,
): Promise<Result<NewTemplateDiffResult>> {
  const reloadResult = await PROJECT_REPOSITORY.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  const project = await PROJECT_REPOSITORY.findProject(destinationProjectName);

  if ("error" in project) {
    return { error: project.error };
  }

  if (!project.data) {
    logError({ shortMessage: `Project ${destinationProjectName} not found` });
    return { error: `Project ${destinationProjectName} not found` };
  }

  const result = await generateModifyTemplateDiff(
    userTemplateSettings,
    project.data,
    templateInstanceId,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}

export async function prepareTemplateInstantiationDiff(
  rootTemplateName: string,
  templateName: string,
  parentInstanceId: string,
  destinationProjectName: string,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<NewTemplateDiffResult>> {
  const reloadResult = await PROJECT_REPOSITORY.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  const destinationProject = await PROJECT_REPOSITORY.findProject(
    destinationProjectName,
  );

  if ("error" in destinationProject) {
    return { error: destinationProject.error };
  }

  if (!destinationProject.data) {
    logError({
      shortMessage: `Destination project ${destinationProjectName} not found`,
    });
    return { error: `Destination project ${destinationProjectName} not found` };
  }

  const result = await generateNewTemplateDiff(
    rootTemplateName,
    templateName,
    parentInstanceId,
    destinationProject.data,
    userTemplateSettings,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}

export async function resolveConflictsAndDiff(
  projectName: string,
): Promise<Result<ParsedFile[]>> {
  const reloadResult = await PROJECT_REPOSITORY.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  const result = await resolveConflictsAndRetrieveAppliedDiff(projectName);

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}

export async function restoreAllChangesToCleanProject(
  projectName: string,
): Promise<Result<void>> {
  const reloadResult = await PROJECT_REPOSITORY.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  const project = await PROJECT_REPOSITORY.findProject(projectName);

  if ("error" in project) {
    return { error: project.error };
  }

  if (!project.data) {
    logError({ shortMessage: `Project ${projectName} not found` });
    return { error: `Project ${projectName} not found` };
  }

  const restoreResult = await resetAllChanges(project.data.absoluteRootDir);

  if ("error" in restoreResult) {
    return { error: restoreResult.error };
  }

  return { data: undefined };
}

export async function applyTemplateDiffToProject(
  projectName: string,
  diffHash: string,
): Promise<Result<ParsedFile[] | { resolveBeforeContinuing: boolean }>> {
  const reloadResult = await PROJECT_REPOSITORY.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  const result = await applyDiffToProject(projectName, diffHash);

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}

export async function cancelProjectCreation(
  projectName: string,
): Promise<Result<void>> {
  const reloadResult = await PROJECT_REPOSITORY.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  const project = await PROJECT_REPOSITORY.findProject(projectName);

  if ("error" in project) {
    return { error: project.error };
  }

  if (!project.data) {
    logError({ shortMessage: `Project ${projectName} not found` });
    return { error: `Project ${projectName} not found` };
  }

  const deleteResult = await deleteRepo(project.data.absoluteRootDir);

  if ("error" in deleteResult) {
    return { error: deleteResult.error };
  }

  return { data: undefined };
}

// instantiate new project has 2 actions. Generate project and see diff(will be left with staged changes). And commit all changes after user accepted.
// instantiate template in existing project has 3 actions. Generate diff, apply diff to project, and commit all changes after user accepted/fixed prs.

// can be used by user manually.
export async function generateNewProjectFromExisting(
  currentProjectName: string,
  newProjectDestinationDirPathId: string,
  newProjectName: string,
): Promise<Result<string>> {
  const reloadResult = await PROJECT_REPOSITORY.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  const parentDirPath = PROJECT_SEARCH_PATHS.find(
    (dir) => dir.id === newProjectDestinationDirPathId,
  )?.path;

  if (!parentDirPath) {
    logError({
      shortMessage: `Invalid project directory path ID: ${newProjectDestinationDirPathId}`,
    });
    return {
      error: `Invalid project directory path ID: ${newProjectDestinationDirPathId}`,
    };
  }

  const project = await PROJECT_REPOSITORY.findProject(currentProjectName);

  if ("error" in project) {
    return { error: project.error };
  }

  if (!project.data) {
    logError({ shortMessage: `Project ${currentProjectName} not found` });
    return { error: `Project ${currentProjectName} not found` };
  }

  project.data.instantiatedProjectSettings.projectName = newProjectName;

  const result = await generateProjectFromTemplateSettings(
    project.data.instantiatedProjectSettings,
    path.join(parentDirPath, newProjectName),
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data as string };
}

export async function retrieveDiffUpdateProjectNewTemplateRevision(
  projectName: string,
  newTemplateRevisionCommitHash: string,
): Promise<Result<NewTemplateDiffResult>> {
  const reloadResult = await PROJECT_REPOSITORY.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  const project = await PROJECT_REPOSITORY.findProject(projectName);

  if ("error" in project) {
    return { error: project.error };
  }

  if (!project.data) {
    logError({ shortMessage: `Project ${projectName} not found` });
    return { error: `Project ${projectName} not found` };
  }

  const result = await generateUpdateTemplateDiff(
    project.data,
    newTemplateRevisionCommitHash,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}

export async function generateProjectFromProjectSettings(
  projectSettingsJson: string,
  projectDirPathId: string,
  newProjectDirName: string,
): Promise<Result<ProjectCreationResult>> {
  let parsedProjectSettings: ProjectSettings | undefined;
  try {
    parsedProjectSettings = ProjectSettingsSchema.parse(
      JSON.parse(projectSettingsJson),
    );
  } catch (error) {
    logError({
      error,
      shortMessage: "Failed to parse project settings.",
    });
    return { error: `Failed to parse project settings.` };
  }

  parsedProjectSettings.projectName = newProjectDirName;

  const reloadResult = await PROJECT_REPOSITORY.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  const parentDirPath = PROJECT_SEARCH_PATHS.find(
    (dir) => dir.id === projectDirPathId,
  )?.path;

  if (!parentDirPath) {
    logError({
      shortMessage: `Invalid project directory path ID: ${projectDirPathId}`,
    });
    return { error: `Invalid project directory path ID: ${projectDirPathId}` };
  }

  const result = await generateProjectFromTemplateSettings(
    parsedProjectSettings,
    path.join(parentDirPath, newProjectDirName),
    true,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data as ProjectCreationResult };
}
