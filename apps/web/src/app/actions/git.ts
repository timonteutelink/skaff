"use server";

import * as tempLib from "@timonteutelink/code-templator-lib";
import { ParsedFile, Result } from "@timonteutelink/code-templator-lib";

export async function commitChanges(
  projectName: string,
  commitMessage: string,
): Promise<Result<void>> {
  return tempLib.addAllAndCommit(projectName, commitMessage);
}

export async function switchProjectBranch(
  projectName: string,
  branch: string,
): Promise<Result<void>> {
  return tempLib.switchProjectBranch(projectName, branch);
}

export async function diffProjectFromItsTemplate(
  projectName: string,
): Promise<Result<ParsedFile[]>> {
  return tempLib.diffProjectFromTemplate(projectName);
}
