import { Result } from "../../lib";
import { logError } from "../../lib/utils";
import { Project } from "../../models";
import { resolveGitService } from "../../core/infra/git-service";

/**
 * @public
 *
 * VEERY IMPORTANT: This function is used to add all changes in the project
 */
export async function addAllAndCommit(
  project: Project,
  commitMessage: string,
): Promise<Result<void>> {
  if (!project.gitStatus) {
    return { data: undefined };
  }
  if (project.gitStatus.isClean) {
    logError({ shortMessage: "No changes to commit" });
    return { error: "No changes to commit" };
  }

  const gitService = resolveGitService();
  const commitResult = await gitService.commitAll(
    project.absoluteRootDir,
    commitMessage,
  );
  if ("error" in commitResult) {
    return { error: commitResult.error };
  }

  return { data: undefined };
}
