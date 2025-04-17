"use server";

import {
  addAllAndDiff,
  commitAll,
  parseGitDiff,
  switchBranch,
} from "@repo/ts/services/git-service";
import { PROJECT_REGISTRY } from "@repo/ts/services/project-registry-service";
import { diffProjectFromTemplate } from "@repo/ts/services/project-service";
import { ParsedFile, Result } from "@repo/ts/utils/types";

export async function commitChanges(
  projectName: string,
  commitMessage: string,
): Promise<Result<void>> {
  const reloadResult = await PROJECT_REGISTRY.reloadProjects();
  if ("error" in reloadResult) {
    console.error("Failed to reload projects:", reloadResult.error);
    return { error: "Failed to reload projects" };
  }

  const project = await PROJECT_REGISTRY.findProject(projectName);
  if ("error" in project) {
    console.error("Failed to find project:", project.error);
    return { error: "Failed to find project" };
  }

  if (!project.data) {
    console.error("Project not found");
    return { error: "Project not found" };
  }

  if (project.data.gitStatus.isClean) {
    console.error("No changes to commit");
    return { error: "No changes to commit" };
  }

  const commitResult = await commitAll(
    project.data.absoluteRootDir,
    commitMessage,
  );
  if ("error" in commitResult) {
    console.error("Failed to commit changes:", commitResult.error);
    return { error: "Failed to commit changes" };
  }

  const newReloadResult = await PROJECT_REGISTRY.reloadProjects();
  if ("error" in newReloadResult) {
    console.error("Failed to reload projects:", newReloadResult.error);
    return { error: "Failed to reload projects" };
  }
  return { data: undefined };
}

export async function switchProjectBranch(
  projectName: string,
  branch: string,
): Promise<Result<void>> {
  const reloadProjectResult = await PROJECT_REGISTRY.reloadProjects();
  if ("error" in reloadProjectResult) {
    console.error("Failed to reload projects:", reloadProjectResult.error);
    return { error: "Failed to reload projects" };
  }
  const project = await PROJECT_REGISTRY.findProject(projectName);

  if ("error" in project) {
    console.error("Failed to find project:", project.error);
    return { error: "Failed to find project" };
  }

  if (!project.data) {
    console.error("Project not found");
    return { error: "Project not found" };
  }

  const branchExists = project.data.gitStatus.branches.includes(branch);

  if (!branchExists) {
    console.error(`Branch ${branch} does not exist`);
    return { error: `Branch ${branch} does not exist` };
  }

  if (!project.data.gitStatus.isClean) {
    console.error("Cannot switch branches with uncommitted changes");
    return { error: "Cannot switch branches with uncommitted changes" };
  }

  const result = await switchBranch(project.data.absoluteRootDir, branch);

  if ("error" in result) {
    console.error("Failed to switch branches:", result.error);
    return { error: "Failed to switch branches" };
  }

  const newReloadResult = await PROJECT_REGISTRY.reloadProjects();

  if ("error" in newReloadResult) {
    console.error("Failed to reload projects:", newReloadResult.error);
    return { error: "Failed to reload projects" };
  }
  return { data: undefined };
}

export async function addAllAndRetrieveCurrentDiff(
  projectName: string,
): Promise<Result<ParsedFile[]>> {
  const project = await PROJECT_REGISTRY.findProject(projectName);

  if ("error" in project) {
    console.error("Failed to find project:", project.error);
    return { error: "Failed to find project" };
  }

  if (!project.data) {
    console.error("Project not found");
    return { error: "Project not found" };
  }

  const diff = await addAllAndDiff(project.data.absoluteRootDir);

  if ("error" in diff) {
    console.error("Failed to add all and retrieve diff:", diff.error);
    return { error: "Failed to add all and retrieve diff" };
  }

  const parsedDiff = parseGitDiff(diff.data);

  const newReloadResult = await PROJECT_REGISTRY.reloadProjects();

  if ("error" in newReloadResult) {
    console.error("Failed to reload projects:", newReloadResult.error);
    return { error: "Failed to reload projects" };
  }

  return { data: parsedDiff };
}

export async function diffProjectFromItsTemplate(
  projectName: string,
): Promise<Result<ParsedFile[]>> {
  return diffProjectFromTemplate(projectName);
}
