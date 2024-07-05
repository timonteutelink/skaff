"use server";
import { deleteRepo, resetAllChanges } from "@repo/ts/services/git-service";
import { PROJECT_REGISTRY } from "@repo/ts/services/project-registry-service";
import {
  applyDiffToProject,
  generateModifyTemplateDiff,
  generateNewTemplateDiff,
  generateProjectFromTemplateSettings,
  instantiateProject,
  resolveConflictsAndRetrieveAppliedDiff,
} from "@repo/ts/services/project-service";
import { PROJECT_SEARCH_PATHS } from "@repo/ts/utils/env";
import {
  NewTemplateDiffResult,
  ParsedFile,
  ProjectCreationResult,
  Result,
} from "@repo/ts/utils/types";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import path from "node:path";

// TODO make sure the templategenerationengine enforces to use the right templatecommithash unless specified otherwise
// TODO fix that changing one character in env vars in turbo_repo generates empty diff.
// TODO fix that env vars are stored inside the autoinstatiated subtemplate instead of the parent template in projectsettings.
export async function createNewProject(
  projectName: string,
  templateName: string,
  projectDirPathId: string,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<ProjectCreationResult>> {
  const reloadResult = await PROJECT_REGISTRY.reloadProjects();
  if ("error" in reloadResult) {
    console.error("Failed to reload projects:", reloadResult.error);
    return { error: reloadResult.error };
  }

  const parentDirPath = PROJECT_SEARCH_PATHS.find(
    (dir) => dir.id === projectDirPathId,
  )?.path;
  if (!parentDirPath) {
    console.error("Invalid project directory path ID");
    return { error: "Invalid project directory path ID" };
  }

  const result = await instantiateProject(
    templateName,
    parentDirPath,
    projectName,
    userTemplateSettings,
  );

  if ("error" in result) {
    console.error("Failed to instantiate project:", result.error);
    return { error: result.error };
  }

  return { data: result.data };
}

export async function prepareTemplateModificationDiff(
  userTemplateSettings: UserTemplateSettings,
  destinationProjectName: string,
  templateInstanceId: string,
): Promise<Result<NewTemplateDiffResult>> {
  const reloadResult = await PROJECT_REGISTRY.reloadProjects();
  if ("error" in reloadResult) {
    console.error("Failed to reload projects:", reloadResult.error);
    return { error: reloadResult.error };
  }

  const result = await generateModifyTemplateDiff(
    userTemplateSettings,
    destinationProjectName,
    templateInstanceId,
  );

  if ("error" in result) {
    console.error("Failed to generate template diff:", result.error);
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
  const reloadResult = await PROJECT_REGISTRY.reloadProjects();
  if ("error" in reloadResult) {
    console.error("Failed to reload projects:", reloadResult.error);
    return { error: reloadResult.error };
  }

  const result = await generateNewTemplateDiff(
    rootTemplateName,
    templateName,
    parentInstanceId,
    destinationProjectName,
    userTemplateSettings,
  );

  if ("error" in result) {
    console.error("Failed to generate template diff:", result.error);
    return { error: result.error };
  }

  return { data: result.data };
}

export async function resolveConflictsAndDiff(
  projectName: string,
): Promise<Result<ParsedFile[]>> {
  const reloadResult = await PROJECT_REGISTRY.reloadProjects();
  if ("error" in reloadResult) {
    console.error("Failed to reload projects:", reloadResult.error);
    return { error: reloadResult.error };
  }

  const result = await resolveConflictsAndRetrieveAppliedDiff(projectName);

  if ("error" in result) {
    console.error("Failed to resolve conflicts:", result.error);
    return { error: result.error };
  }

  return { data: result.data };
}

export async function restoreAllChangesToCleanProject(
  projectName: string,
): Promise<Result<void>> {
  const reloadResult = await PROJECT_REGISTRY.reloadProjects();
  if ("error" in reloadResult) {
    console.error("Failed to reload projects:", reloadResult.error);
    return { error: reloadResult.error };
  }

  const project = await PROJECT_REGISTRY.findProject(projectName);

  if ("error" in project) {
    console.error("Failed to find project:", project.error);
    return { error: project.error };
  }

  if (!project.data) {
    console.error("Project not found");
    return { error: "Project not found" };
  }

  const restoreResult = await resetAllChanges(project.data.absoluteRootDir);

  if ("error" in restoreResult) {
    console.error("Failed to restore changes:", restoreResult.error);
    return { error: restoreResult.error };
  }

  return { data: undefined };
}

export async function applyTemplateDiffToProject(
  projectName: string,
  diffHash: string,
): Promise<Result<ParsedFile[] | { resolveBeforeContinuing: boolean }>> {
  const reloadResult = await PROJECT_REGISTRY.reloadProjects();
  if ("error" in reloadResult) {
    console.error("Failed to reload projects:", reloadResult.error);
    return { error: reloadResult.error };
  }

  const result = await applyDiffToProject(projectName, diffHash);

  if ("error" in result) {
    console.error("Failed to apply diff:", result.error);
    return { error: result.error };
  }

  return { data: result.data };
}

export async function cancelProjectCreation(
  projectName: string,
): Promise<Result<void>> {
  const reloadResult = await PROJECT_REGISTRY.reloadProjects();
  if ("error" in reloadResult) {
    console.error("Failed to reload projects:", reloadResult.error);
    return { error: reloadResult.error };
  }

  const project = await PROJECT_REGISTRY.findProject(projectName);

  if ("error" in project) {
    console.error("Failed to find project:", project.error);
    return { error: project.error };
  }

  if (!project.data) {
    console.error("Project not found");
    return { error: "Project not found" };
  }

  const deleteResult = await deleteRepo(project.data.absoluteRootDir);

  if ("error" in deleteResult) {
    console.error("Failed to delete project:", deleteResult.error);
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
  const reloadResult = await PROJECT_REGISTRY.reloadProjects();
  if ("error" in reloadResult) {
    console.error("Failed to reload projects:", reloadResult.error);
    return { error: reloadResult.error };
  }

  const parentDirPath = PROJECT_SEARCH_PATHS.find(
    (dir) => dir.id === newProjectDestinationDirPathId,
  )?.path;
  if (!parentDirPath) {
    console.error("Invalid project directory path ID");
    return { error: "Invalid project directory path ID" };
  }

  const project = await PROJECT_REGISTRY.findProject(currentProjectName);

  if ("error" in project) {
    console.error("Failed to find project:", project.error);
    return { error: project.error };
  }

  if (!project.data) {
    console.error("Project not found");
    return { error: "Project not found" };
  }

  project.data.instantiatedProjectSettings.projectName = newProjectName;

  const result = await generateProjectFromTemplateSettings(
    project.data.instantiatedProjectSettings,
    path.join(parentDirPath, newProjectName),
  );

  if ("error" in result) {
    console.error("Failed to generate new project:", result.error);
    return { error: result.error };
  }

  return { data: result.data };
}
