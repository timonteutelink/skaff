import { Result } from "../../lib";
import { Project } from "../../models";
import { resolveGitService } from "../../core/infra/git-service";

export async function deleteProject(
  project: Project,
): Promise<Result<void>> {
  const gitService = resolveGitService();
  const deleteResult = await gitService.deleteRepo(project.absoluteRootDir);

  if ("error" in deleteResult) {
    return { error: deleteResult.error };
  }

  return { data: undefined };
}
