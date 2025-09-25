import { Result } from "../../lib";
import { Project } from "../../models";
import { deleteRepo } from "../../core/infra/git-service";

export async function deleteProject(
  project: Project,
): Promise<Result<void>> {
  const deleteResult = await deleteRepo(project.absoluteRootDir);

  if ("error" in deleteResult) {
    return { error: deleteResult.error };
  }

  return { data: undefined };
}
