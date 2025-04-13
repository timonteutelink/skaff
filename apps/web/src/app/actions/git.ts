"use server";

import { loadGitStatus, switchBranch } from "@repo/ts/services/git-service";
import { PROJECT_REGISTRY } from "@repo/ts/services/project-registry-service";
import { GitStatus, Result } from "@repo/ts/utils/types";

// import { GitStatus } from "@/components/general/projects/types";

// export async function getProjectGitStatus(projectName: string): Promise<GitStatus> {
//   // This would be implemented to interact with your git system
//   // For now, returning mock data
//   return {
//     isClean: Math.random() > 0.5, // Random for demo purposes
//     currentBranch: "main",
//     branches: ["main", "develop", "feature/new-ui", "bugfix/login-issue"],
//   }
// }
//
export async function switchProjectBranch(projectName: string, branch: string): Promise<Result<void>> {
  PROJECT_REGISTRY.reloadProjects()
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

// export async function retrieveDiff(
//   projectName: string,
//   branch: string,
// ): Promise<string> {
//   const project = await PROJECT_REGISTRY.findProject(projectName);
//
//   if (!project) {
//     throw new Error("Project not found");
//   }
//
//   const diff = await project.getDiff(branch);
//   return diff;
// }


