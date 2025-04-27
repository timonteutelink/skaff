"use server";
import { PROJECT_REGISTRY } from "@repo/ts/services/project-registry-service";
import { PROJECT_SEARCH_PATHS } from "@repo/ts/lib/env";
import { ProjectDTO, Result } from "@repo/ts/lib/types";
import { logger } from "@repo/ts/lib/logger";

export async function retrieveProjectSearchPaths(): Promise<
  { id: string; path: string }[]
> {
  return PROJECT_SEARCH_PATHS;
}

export async function retrieveProjects(): Promise<Result<ProjectDTO[]>> {
  const reloadResult = await PROJECT_REGISTRY.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }
  const projects = await PROJECT_REGISTRY.getProjects();

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

export async function retrieveProject(
  projectName: string,
): Promise<Result<ProjectDTO | null>> {
  const reloadResult = await PROJECT_REGISTRY.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }
  const project = await PROJECT_REGISTRY.findProject(projectName);

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
