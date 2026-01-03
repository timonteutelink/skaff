"use server";

import "server-only";

import { findProject } from "@/lib/server-utils";
import type { ParsedFile, Result } from "@timonteutelink/skaff-lib";

const loadSkaffLib = () => import("@timonteutelink/skaff-lib");

export async function commitChanges(
  projectRepositoryName: string,
  commitMessage: string,
): Promise<Result<void>> {
  const project = await findProject(projectRepositoryName);

  if ('error' in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectRepositoryName} not found.` };
  }

  const tempLib = await loadSkaffLib();
  return await tempLib.addAllAndCommit(project.data, commitMessage);
}

export async function switchProjectBranch(
  projectRepositoryName: string,
  branch: string,
): Promise<Result<void>> {
  const project = await findProject(projectRepositoryName);

  if ('error' in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectRepositoryName} not found.` };
  }

  const tempLib = await loadSkaffLib();
  return await tempLib.switchProjectBranch(project.data, branch);
}

export async function diffProjectFromItsTemplate(
  projectRepositoryName: string,
): Promise<Result<ParsedFile[]>> {
  const project = await findProject(projectRepositoryName);

  if ('error' in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectRepositoryName} not found.` };
  }

  const tempLib = await loadSkaffLib();
  const result = await tempLib.diffProjectFromTemplate(project.data);
  if ('error' in result) {
    return { error: result.error };
  }

  return { data: result.data.files };
}
