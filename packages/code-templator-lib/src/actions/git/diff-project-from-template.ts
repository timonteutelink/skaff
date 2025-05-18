import { ParsedFile, Result } from "../../lib";
import { logError } from "../../lib/utils";
import { getProjectRepository } from "../../repositories";
import { diffProjectFromItsTemplate } from "../../services/project-diff-service";

export async function diffProjectFromTemplate(
  projectName: string,
): Promise<Result<ParsedFile[]>> {
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
  return diffProjectFromItsTemplate(project.data);
}
