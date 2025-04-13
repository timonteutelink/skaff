import { PROJECT_REGISTRY } from "@repo/ts/services/project-registry-service";
import { PROJECT_SEARCH_PATHS } from "@repo/ts/utils/env";
import { ProjectDTO } from "@repo/ts/utils/types";

export async function retrieveProjectSearchPaths(): Promise<{ id: string; path: string }[]> {
  return PROJECT_SEARCH_PATHS;
}
export async function reloadProjects(): Promise<void> {
  await PROJECT_REGISTRY.reloadProjects();
}

export async function retrieveProjects(): Promise<ProjectDTO[]> {
  await PROJECT_REGISTRY.getProjects();

  const projects = PROJECT_REGISTRY.projects.map((project) =>
    project.mapToDTO(),
  );

  return projects;
}

export async function retrieveProject(
  projectName: string,
): Promise<ProjectDTO | null> {
  const project = await PROJECT_REGISTRY.findProject(projectName);

  if (project) {
    return project.mapToDTO();
  }

  return null;
}
