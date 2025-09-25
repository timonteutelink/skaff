import { ParsedFile, Result } from "../../lib";
import { Project } from "../../models";
import {
  addAllAndRetrieveDiff,
  parseGitDiff,
} from "../../core/infra/git-service";

export async function addAllAndDiff(
  project: Project
): Promise<Result<ParsedFile[]>> {
  const addAllResult = await addAllAndRetrieveDiff(
    project.absoluteRootDir,
  );

  if ("error" in addAllResult) {
    return addAllResult;
  }

  return { data: parseGitDiff(addAllResult.data) };
}
