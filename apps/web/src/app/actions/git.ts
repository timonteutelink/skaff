"use server";

import { findProject } from "@/lib/server-utils";
import * as tempLib from "@timonteutelink/code-templator-lib";
import { ParsedFile, Result } from "@timonteutelink/code-templator-lib";

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

  return tempLib.addAllAndCommit(project.data, commitMessage);
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

  return tempLib.switchProjectBranch(project.data, branch);
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

  return tempLib.diffProjectFromTemplate(project.data);
}
