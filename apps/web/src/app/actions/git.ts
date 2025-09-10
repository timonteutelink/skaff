"use server";

import { findProject } from "@/lib/server-utils";
import * as tempLib from "@timonteutelink/skaff-lib";
import { ParsedFile, Result } from "@timonteutelink/skaff-lib";

export async function commitChanges(
  projectName: string,
  commitMessage: string,
): Promise<Result<void>> {
  const project = await findProject(projectName);

  if ('error' in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectName} not found.` };
  }

  return await tempLib.addAllAndCommit(project.data, commitMessage);
}

export async function switchProjectBranch(
  projectName: string,
  branch: string,
): Promise<Result<void>> {
  const project = await findProject(projectName);

  if ('error' in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectName} not found.` };
  }

  return await tempLib.switchProjectBranch(project.data, branch);
}

export async function diffProjectFromItsTemplate(
  projectName: string,
): Promise<Result<ParsedFile[]>> {
  const project = await findProject(projectName);

  if ('error' in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectName} not found.` };
  }

  const result = await tempLib.diffProjectFromTemplate(project.data);
  if ('error' in result) {
    return { error: result.error };
  }

  return { data: result.data.files };
}
