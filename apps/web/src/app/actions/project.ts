'use server';
import { PROJECT_REGISTRY } from "@repo/ts/services/project-registry-service";
import { PROJECT_SEARCH_PATHS } from "@repo/ts/utils/env";
import { ProjectDTO, Result } from "@repo/ts/utils/types";

export async function retrieveProjectSearchPaths(): Promise<{ id: string; path: string }[]> {
  return PROJECT_SEARCH_PATHS;
}

export async function reloadProjects(): Promise<Result<void>> {
  return await PROJECT_REGISTRY.reloadProjects();
}

export async function retrieveProjects(): Promise<Result<ProjectDTO[]>> {
  const projects = await PROJECT_REGISTRY.getProjects();

  if ("error" in projects) {
    console.error("Failed to load projects:", projects.error);
    return { error: projects.error };
  }

  const projectDtos = projects.data.map((project) =>
    project.mapToDTO(),
  );

  return { data: projectDtos };
}

export async function retrieveProject(
  projectName: string,
): Promise<Result<ProjectDTO | null>> {
  const project = await PROJECT_REGISTRY.findProject(projectName);

  if ("error" in project) {
    console.error("Failed to find project:", project.error);
    return { error: project.error };
  }

  if (project.data) {
    return { data: project.data.mapToDTO() };
  }

  return { data: null };
}
