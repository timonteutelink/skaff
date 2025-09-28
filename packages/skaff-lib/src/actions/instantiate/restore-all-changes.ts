import { Result } from "../../lib";
import { Project } from "../../models";
import { resolveGitService } from "../../core/infra/git-service";

export async function restoreAllChanges(
  project: Project
): Promise<Result<void>> {
  const gitService = resolveGitService();
  const restoreResult = await gitService.resetAllChanges(
    project.absoluteRootDir,
  );

  if ("error" in restoreResult) {
    return { error: restoreResult.error };
  }

  return { data: undefined };
}
