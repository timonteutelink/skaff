import { ProjectDTO, Result } from "../../lib";
import { getProjectRepository } from "../../repositories";

export async function getProjects(): Promise<Result<ProjectDTO[]>> {
  const projectRepository = await getProjectRepository();
  const reloadResult = await projectRepository.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }
  const projects = await projectRepository.getProjects();

  if ("error" in projects) {
    return { error: projects.error };
  }

  const projectDtos: ProjectDTO[] = [];

  for (const project of projects.data) {
    const projectDto = project.mapToDTO();

    if ("error" in projectDto) {
      return { error: projectDto.error };
    }

    projectDtos.push(projectDto.data);
  }

  return { data: projectDtos };
}
