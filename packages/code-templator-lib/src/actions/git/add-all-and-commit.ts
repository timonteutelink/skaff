import { Result } from "../../lib";
import { logError } from "../../lib/utils";
import { Project } from "../../models";
import { commitAll } from "../../services/git-service";

export async function addAllAndCommit(
  project: Project,
  commitMessage: string,
): Promise<Result<void>> {
  if (project.gitStatus.isClean) {
    logError({ shortMessage: "No changes to commit" });
    return { error: "No changes to commit" };
  }

  const commitResult = await commitAll(
    project.absoluteRootDir,
    commitMessage,
  );
  if ("error" in commitResult) {
    return { error: commitResult.error };
  }

  return { data: undefined };
}
