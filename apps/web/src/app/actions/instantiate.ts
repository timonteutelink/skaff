'use server';
import { deleteRepo, restoreAllChanges } from "@repo/ts/services/git-service";
import { PROJECT_REGISTRY } from "@repo/ts/services/project-registry-service";
import { applyDiffToProject, generateNewTemplateDiff, generateProjectFromTemplateSettings, instantiateProject, resolveConflictsAndRetrieveAppliedDiff } from "@repo/ts/services/project-service";
import { PROJECT_SEARCH_PATHS } from "@repo/ts/utils/env";
import { NewTemplateDiffResult, ParsedFile, ProjectCreationResult, Result } from "@repo/ts/utils/types";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import path from "node:path";

export async function createNewProject(
  projectName: string,
  templateName: string,
  projectDirPathId: string,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<ProjectCreationResult>> {
  const parentDirPath = PROJECT_SEARCH_PATHS.find((dir) => dir.id === projectDirPathId)?.path;
  if (!parentDirPath) {
    return { error: "Invalid project directory path ID" };
  }

  const result = await instantiateProject(templateName, parentDirPath, projectName, userTemplateSettings);

  if ("error" in result) {
    return { error: result.error };
  }

  await PROJECT_REGISTRY.reloadProjects();

  return { data: result.data };
}

export async function prepareTemplateInstantiationDiff(
  rootTemplateName: string,
  templateName: string,
  parentInstanceId: string,
  destinationProjectName: string,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<NewTemplateDiffResult>> {
  const result = await generateNewTemplateDiff(
    rootTemplateName,
    templateName,
    parentInstanceId,
    destinationProjectName,
    userTemplateSettings,
  )

  if ("error" in result) {
    return { error: result.error };
  }

  await PROJECT_REGISTRY.reloadProjects();
  return { data: result.data };
}

export async function resolveConflictsAndDiff(
  projectName: string,
): Promise<Result<ParsedFile[]>> {
  const result = await resolveConflictsAndRetrieveAppliedDiff(projectName);

  if ("error" in result) {
    return { error: result.error };
  }

  await PROJECT_REGISTRY.reloadProjects();
  return { data: result.data };
}

export async function restoreAllChangesToCleanProject(
  projectName: string,
): Promise<Result<void>> {
  const project = await PROJECT_REGISTRY.findProject(projectName);

  if (!project) {
    return { error: "Project not found" };
  }

  const restoreResult = await restoreAllChanges(project.absoluteRootDir);

  if (!restoreResult) {
    return { error: "Failed to restore changes" };
  }

  await PROJECT_REGISTRY.reloadProjects();

  return { data: undefined };
}

export async function applyTemplateDiffToProject(
  projectName: string,
  diffHash: string,
): Promise<Result<ParsedFile[] | { resolveBeforeContinuing: boolean }>> {
  const result = await applyDiffToProject(projectName, diffHash);

  if ("error" in result) {
    return { error: result.error };
  }

  await PROJECT_REGISTRY.reloadProjects();

  return { data: result.data };
}

export async function cancelProjectCreation(
  projectName: string,
): Promise<Result<void>> {
  const project = await PROJECT_REGISTRY.findProject(projectName);

  if (!project) {
    return { error: "Project not found" };
  }

  const deleteResult = await deleteRepo(project.absoluteRootDir);

  if (!deleteResult) {
    return { error: "Failed to delete project" };
  }

  await PROJECT_REGISTRY.reloadProjects();

  return { data: undefined };
}

// instantiate new project has 2 actions. Generate project and see diff(will be left with staged changes). And commit all changes after user accepted.
// instantiate template in existing project has 3 actions. Generate diff, apply diff to project, and commit all changes after user accepted/fixed prs.

// can be used by user manually.
export async function generateNewProjectFromExisting(currentProjectName: string, newProjectDestinationDirPathId: string, newProjectName: string): Promise<Result<string>> {
  const parentDirPath = PROJECT_SEARCH_PATHS.find((dir) => dir.id === newProjectDestinationDirPathId)?.path;
  if (!parentDirPath) {
    return { error: "Invalid project directory path ID" };
  }

  const project = await PROJECT_REGISTRY.findProject(currentProjectName);
  if (!project) {
    return { error: "Project not found" };
  }

  const result = await generateProjectFromTemplateSettings(project.instantiatedProjectSettings, newProjectName, path.join(parentDirPath, newProjectName));

  if ("error" in result) {
    return { error: result.error };
  }

  await PROJECT_REGISTRY.reloadProjects();

  return { data: result.data };
}
