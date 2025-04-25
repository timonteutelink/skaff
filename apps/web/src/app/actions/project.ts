"use server";
import { PROJECT_REGISTRY } from "@repo/ts/services/project-registry-service";
import { PROJECT_SEARCH_PATHS } from "@repo/ts/lib/env";
import { ProjectDTO, Result } from "@repo/ts/lib/types";

export async function retrieveProjectSearchPaths(): Promise<
  { id: string; path: string }[]
> {
  return PROJECT_SEARCH_PATHS;
}

export async function retrieveProjects(): Promise<Result<ProjectDTO[]>> {
  const reloadResult = await PROJECT_REGISTRY.reloadProjects();
  if ("error" in reloadResult) {
    logger.error("Failed to reload projects:", reloadResult.error);
    return { error: reloadResult.error };
  }
  const projects = await PROJECT_REGISTRY.getProjects();

  if ("error" in projects) {
    logger.error("Failed to load projects:", projects.error);
    return { error: projects.error };
  }

  const projectDtos: ProjectDTO[] = [];

  for (const project of projects.data) {
    const projectDto = project.mapToDTO();

    if ("error" in projectDto) {
      logger.error("Failed to map project to DTO:", projectDto.error);
      return { error: projectDto.error };
    }

    projectDtos.push(projectDto.data);
  }

  return { data: projectDtos };
}

export async function retrieveProject(
  projectName: string,
): Promise<Result<ProjectDTO | null>> {
  const reloadResult = await PROJECT_REGISTRY.reloadProjects();
  if ("error" in reloadResult) {
    logger.error("Failed to reload projects:", reloadResult.error);
    return { error: reloadResult.error };
  }
  const project = await PROJECT_REGISTRY.findProject(projectName);

  if ("error" in project) {
    logger.error("Failed to find project:", project.error);
    return { error: project.error };
  }

  if (!project.data) {
    logger.error("Project not found");
    return { data: null };
  }

  const projectDto = project.data.mapToDTO();

  if ("error" in projectDto) {
    logger.error("Failed to map project to DTO:", projectDto.error);
    return { error: projectDto.error };
  }

  return { data: projectDto.data };
}
