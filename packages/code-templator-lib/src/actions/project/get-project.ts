import { logger, ProjectDTO, Result } from "../../lib";
import { getProjectRepository } from "../../repositories";

export async function getProject(
  projectName: string,
): Promise<Result<ProjectDTO | null>> {
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
    logger.warn(`Project ${projectName} not found`);
    return { data: null };
  }

  const projectDto = project.data.mapToDTO();

  if ("error" in projectDto) {
    return { error: projectDto.error };
  }

  return { data: projectDto.data };
}
