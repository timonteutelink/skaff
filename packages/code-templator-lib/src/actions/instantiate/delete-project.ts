import { Result } from "../../lib";
import { logError } from "../../lib/utils";
import { getProjectRepository } from "../../repositories";
import { deleteRepo } from "../../services/git-service";

export async function deleteProject(
  projectName: string,
): Promise<Result<void>> {
  const projectRepository = await getProjectRepository();
  const reloadResult = await projectRepository.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  const project = await projectRepository.findProject(projectName);

  if ("error" in project) {
    return { error: project.error };
  }

  if (!project.data) {
    logError({ shortMessage: `Project ${projectName} not found` });
    return { error: `Project ${projectName} not found` };
  }

  const deleteResult = await deleteRepo(project.data.absoluteRootDir);

  if ("error" in deleteResult) {
    return { error: deleteResult.error };
  }

  return { data: undefined };
}
