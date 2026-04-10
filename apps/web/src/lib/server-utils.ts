import "server-only";

import type { Project, Result } from "@timonteutelink/skaff-lib";

const loadSkaffLib = () => import("@timonteutelink/skaff-lib");

export async function findProject(
  projectRepositoryName: string,
): Promise<Result<Project>> {
  const tempLib = await loadSkaffLib();
  const projectRepository = tempLib.resolveProjectRepository();
  const config = await tempLib.getConfig();

  let project: Project | null = null;
  for (const searchPath of config.PROJECT_SEARCH_PATHS) {
    const result = await projectRepository.findProjectByRepositoryName(
      searchPath,
      projectRepositoryName,
    );
    if ("error" in result) {
      return { error: result.error };
    }

    if (result.data) {
      project = result.data;
      break;
    }
  }

  if (!project) {
    tempLib.backendLogger.error(`Project ${projectRepositoryName} not found`);
    return { error: `Project ${projectRepositoryName} not found` };
  }

  return { data: project };
}

export async function listProjects(): Promise<Result<Project[]>> {
  const tempLib = await loadSkaffLib();
  const projectRepository = tempLib.resolveProjectRepository();
  const config = await tempLib.getConfig();

  const projectSearchPaths = config.PROJECT_SEARCH_PATHS;

  const projects: Project[] = [];
  for (const searchPath of projectSearchPaths) {
    const foundProjects = await projectRepository.findProjects(searchPath);
    if ("error" in foundProjects) {
      return foundProjects;
    }
    projects.push(...foundProjects.data);
  }

  if (projects.length === 0) {
    return { data: [] };
  }

  return { data: projects };
}
