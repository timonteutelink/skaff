import { getConfig, getProjectRepository, logger, Project, Result } from "@timonteutelink/code-templator-lib";

export async function findProject(
  projectName: string,
): Promise<Result<Project>> {
  const projectRepository = await getProjectRepository();
  const config = await getConfig();

  let project: Project | null = null;
  for (const searchPath of config.PROJECT_SEARCH_PATHS) {
    const result = await projectRepository.findProjectByName(searchPath, projectName);
    if ("error" in result) {
      return { error: result.error };
    }

    if (result.data) {
      project = result.data;
      break;
    }
  }

  if (!project) {
    logger.error(`Project ${projectName} not found`);
    return { error: `Project ${projectName} not found` };
  }

  return { data: project};
}

export async function listProjects(): Promise<Result<Project[]>> {
  const projectRepository = await getProjectRepository();
  const config = await getConfig();

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
