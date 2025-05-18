import { Result } from "../../lib";
import { logError } from "../../lib/utils";
import { getProjectRepository } from "../../repositories";

export async function runProjectCommand(
  projectName: string,
  templateInstanceId: string,
  commandTitle: string,
): Promise<Result<string>> {
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

  const result = await project.data.executeTemplateCommand(
    templateInstanceId,
    commandTitle,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}
