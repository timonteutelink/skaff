"use server";

import { addAllAndDiff, commitAll, deleteRepo, parseGitDiff, switchBranch } from "@repo/ts/services/git-service";
import { PROJECT_REGISTRY } from "@repo/ts/services/project-registry-service";
import { ParsedFile, Result } from "@repo/ts/utils/types";

export async function commitChanges(
  projectName: string,
  commitMessage: string,
): Promise<Result<void>> {
  await PROJECT_REGISTRY.reloadProjects()
  const project = await PROJECT_REGISTRY.findProject(projectName)

  if (!project) {
    console.error("Project not found")
    return { error: "Project not found" }
  }

  if (project.gitStatus.isClean) {
    console.error("No changes to commit")
    return { error: "No changes to commit" }
  }

  await commitAll(project.absoluteRootDir, commitMessage)

  await PROJECT_REGISTRY.reloadProjects()
  return { data: undefined }
}

export async function switchProjectBranch(projectName: string, branch: string): Promise<Result<void>> {
  await PROJECT_REGISTRY.reloadProjects()
  const project = await PROJECT_REGISTRY.findProject(projectName)

  if (!project) {
    console.error("Project not found")
    return { error: "Project not found" }
  }

  const branchExists = project.gitStatus.branches.includes(branch)

  if (!branchExists) {
    console.error(`Branch ${branch} does not exist`)
    return { error: `Branch ${branch} does not exist` }
  }

  if (!project.gitStatus.isClean) {
    console.error("Cannot switch branches with uncommitted changes")
    return { error: "Cannot switch branches with uncommitted changes" }
  }

  const result = await switchBranch(project.absoluteRootDir, branch)

  if (!result) {
    console.error(`Failed to switch to branch ${branch}`)
    return { error: `Failed to switch to branch ${branch}` }
  }

  await PROJECT_REGISTRY.reloadProjects()
  return { data: undefined }
}

export async function addAllAndRetrieveCurrentDiff(
  projectName: string,
): Promise<Result<ParsedFile[]>> {
  const project = await PROJECT_REGISTRY.findProject(projectName);

  if (!project) {
    console.error("Project not found");
    return { error: "Project not found" };
  }

  const diff = await addAllAndDiff(project.absoluteRootDir);

  if (!diff) {
    console.error("Failed to retrieve diff");
    return { error: "Failed to retrieve diff" };
  }

  const parsedDiff = parseGitDiff(diff);

  if (parsedDiff.length === 0) {
    console.error("No changes detected");
    return { error: "No changes detected" };
  }

  await PROJECT_REGISTRY.reloadProjects();

  return { data: parsedDiff };
}

