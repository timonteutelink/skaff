import { Result } from "../../lib";
import { logError } from "../../lib/utils";
import { getProjectRepository } from "../../repositories";
import { switchBranch } from "../../services/git-service";

export async function switchProjectBranch(
  projectName: string,
  branch: string,
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

  const branchExists = project.data.gitStatus.branches.includes(branch);

  if (!branchExists) {
    logError({ shortMessage: `Branch ${branch} does not exist` });
    return { error: `Branch ${branch} does not exist` };
  }

  if (!project.data.gitStatus.isClean) {
    logError({
      shortMessage: "Cannot switch branches with uncommitted changes",
    });
    return { error: "Cannot switch branches with uncommitted changes" };
  }

  const result = await switchBranch(project.data.absoluteRootDir, branch);

  if ("error" in result) {
    return { error: result.error };
  }

  const newReloadResult = await projectRepository.reloadProjects();

  if ("error" in newReloadResult) {
    return { error: newReloadResult.error };
  }
  return { data: undefined };
}
