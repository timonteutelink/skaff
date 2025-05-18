import { Result } from "../../lib";
import { logError } from "../../lib/utils";
import { getProjectRepository } from "../../repositories";
import { resetAllChanges } from "../../services/git-service";

export async function restoreAllChanges(
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

  const restoreResult = await resetAllChanges(project.data.absoluteRootDir);

  if ("error" in restoreResult) {
    return { error: restoreResult.error };
  }

  return { data: undefined };
}
