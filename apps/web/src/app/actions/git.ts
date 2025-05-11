"use server";

import {
  addAllAndDiff,
  commitAll,
  parseGitDiff,
  switchBranch,
} from "@timonteutelink/code-templator-lib/services/git-service";
import { diffProjectFromTemplate } from "@timonteutelink/code-templator-lib/services/project-diff-service";
import { ParsedFile, Result } from "@timonteutelink/code-templator-lib/lib/types";
import { logger } from "@timonteutelink/code-templator-lib/lib/logger";
import { PROJECT_REPOSITORY } from "@timonteutelink/code-templator-lib/repositories/project-repository";
import { logError } from "@timonteutelink/code-templator-lib/lib/utils";

export async function commitChanges(
  projectName: string,
  commitMessage: string,
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
    logError({ shortMessage: `Project ${projectName} not found` })
    return { error: `Project ${projectName} not found` };
  }

  if (project.data.gitStatus.isClean) {
    logError({ shortMessage: "No changes to commit" })
    return { error: "No changes to commit" };
  }

  const commitResult = await commitAll(
    project.data.absoluteRootDir,
    commitMessage,
  );
  if ("error" in commitResult) {
    return { error: commitResult.error };
  }

  const newReloadResult = await PROJECT_REPOSITORY.reloadProjects();
  if ("error" in newReloadResult) {
    return { error: newReloadResult.error };
  }
  return { data: undefined };
}

export async function switchProjectBranch(
  projectName: string,
  branch: string,
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
    logError({ shortMessage: `Project ${projectName} not found` })
    return { error: `Project ${projectName} not found` };
  }

  const branchExists = project.data.gitStatus.branches.includes(branch);

  if (!branchExists) {
    logError({ shortMessage: `Branch ${branch} does not exist` })
    return { error: `Branch ${branch} does not exist` };
  }

  if (!project.data.gitStatus.isClean) {
    logError({ shortMessage: "Cannot switch branches with uncommitted changes" })
    return { error: "Cannot switch branches with uncommitted changes" };
  }

  const result = await switchBranch(project.data.absoluteRootDir, branch);

  if ("error" in result) {
    return { error: result.error };
  }

  const newReloadResult = await PROJECT_REPOSITORY.reloadProjects();

  if ("error" in newReloadResult) {
    return { error: newReloadResult.error };
  }
  return { data: undefined };
}

export async function addAllAndRetrieveCurrentDiff(
  projectName: string,
): Promise<Result<ParsedFile[]>> {
  const reloadResult = await PROJECT_REPOSITORY.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  const project = await PROJECT_REPOSITORY.findProject(projectName);

  if ("error" in project) {
    return { error: project.error };
  }

  if (!project.data) {
    logError({ shortMessage: `Project ${projectName} not found` })
    return { error: `Project ${projectName} not found` };
  }

  const diff = await addAllAndDiff(project.data.absoluteRootDir);

  if ("error" in diff) {
    return { error: diff.error };
  }

  const parsedDiff = parseGitDiff(diff.data);

  const newReloadResult = await PROJECT_REPOSITORY.reloadProjects();

  if ("error" in newReloadResult) {
    return { error: newReloadResult.error };
  }

  return { data: parsedDiff };
}

export async function diffProjectFromItsTemplate(
  projectName: string,
): Promise<Result<ParsedFile[]>> {
  const reloadResult = await PROJECT_REPOSITORY.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }
  const project = await PROJECT_REPOSITORY.findProject(projectName);

  if ("error" in project) {
    return { error: project.error };
  }

  if (!project.data) {
    logError({ shortMessage: `Project ${projectName} not found` })
    return { error: `Project ${projectName} not found` };
  }
  return diffProjectFromTemplate(project.data);
}
