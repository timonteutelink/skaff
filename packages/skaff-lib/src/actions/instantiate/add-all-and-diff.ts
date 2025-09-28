import { ParsedFile, Result } from "../../lib";
import { Project } from "../../models";
import { resolveGitService } from "../../core/infra/git-service";

export async function addAllAndDiff(
  project: Project
): Promise<Result<ParsedFile[]>> {
  const gitService = resolveGitService();
  const addAllResult = await gitService.addAllAndRetrieveDiff(
    project.absoluteRootDir,
  );

  if ("error" in addAllResult) {
    return addAllResult;
  }

  return { data: gitService.parseGitDiff(addAllResult.data) };
}
