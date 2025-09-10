import { Result } from "../../lib";
import { logError } from "../../lib/utils";
import { Project } from "../../models";
import { switchBranch } from "../../services/git-service";

export async function switchProjectBranch(
  project: Project,
  branch: string,
): Promise<Result<void>> {
  if (!project.gitStatus) {
    logError({shortMessage: "no git status"})
    return {
      error: "No gitstatus on project"
    }
  }
  const branchExists = project.gitStatus.branches.includes(branch);

  if (!branchExists) {
    logError({ shortMessage: `Branch ${branch} does not exist` });
    return { error: `Branch ${branch} does not exist` };
  }

  if (!project.gitStatus.isClean) {
    logError({
      shortMessage: "Cannot switch branches with uncommitted changes",
    });
    return { error: "Cannot switch branches with uncommitted changes" };
  }

  const result = await switchBranch(project.absoluteRootDir, branch);

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: undefined };
}
