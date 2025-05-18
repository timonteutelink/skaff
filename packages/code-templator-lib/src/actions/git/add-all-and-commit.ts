import { Result } from "../../lib";
import { logError } from "../../lib/utils";
import { getProjectRepository } from "../../repositories";
import { commitAll } from "../../services/git-service";

export async function addAllAndCommit(
  projectName: string,
  commitMessage: string,
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

  if (project.data.gitStatus.isClean) {
    logError({ shortMessage: "No changes to commit" });
    return { error: "No changes to commit" };
  }

  const commitResult = await commitAll(
    project.data.absoluteRootDir,
    commitMessage,
  );
  if ("error" in commitResult) {
    return { error: commitResult.error };
  }

  const newReloadResult = await projectRepository.reloadProjects();
  if ("error" in newReloadResult) {
    return { error: newReloadResult.error };
  }
  return { data: undefined };
}
