"use server";
import { PROJECT_SEARCH_PATHS } from "@repo/ts/lib/env";
import { ProjectDTO, Result } from "@repo/ts/lib/types";
import { logger } from "@repo/ts/lib/logger";
import { PROJECT_REPOSITORY } from "@repo/ts/repositories/project-repository";
import { logError } from "@repo/ts/lib/utils";

export async function retrieveProjectSearchPaths(): Promise<
  { id: string; path: string }[]
> {
  return PROJECT_SEARCH_PATHS;
}

export async function retrieveProjects(): Promise<Result<ProjectDTO[]>> {
  const reloadResult = await PROJECT_REPOSITORY.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }
  const projects = await PROJECT_REPOSITORY.getProjects();

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
  const reloadResult = await PROJECT_REPOSITORY.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }
  const project = await PROJECT_REPOSITORY.findProject(projectName);

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

export async function runProjectCommand(
  projectName: string,
  templateInstanceId: string,
  commandTitle: string,
): Promise<Result<string>> {
  const reloadResult = await PROJECT_REPOSITORY.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }
  const project = await PROJECT_REPOSITORY.findProject(projectName);

  if ("error" in project) {
    return { error: project.error };
  }

  if (!project.data) {
    logError({ shortMessage: `Project ${projectName} not found` })
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
