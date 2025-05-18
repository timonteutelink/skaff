import { getConfig } from "../lib";
import { ProjectRepository } from "./project-repository";
import { RootTemplateRepository } from "./root-template-repository";

let rootTemplateRepository: RootTemplateRepository | null = null;

export async function getRootTemplateRepository(): Promise<RootTemplateRepository> {
  if (rootTemplateRepository) {
    return rootTemplateRepository;
  }

  const config = await getConfig();

  rootTemplateRepository = new RootTemplateRepository(
    config.TEMPLATE_DIR_PATHS,
  );

  return rootTemplateRepository;
}

let projectRepository: ProjectRepository | null = null;

export async function getProjectRepository(): Promise<ProjectRepository> {
  if (projectRepository) {
    return projectRepository;
  }

  const config = await getConfig();

  projectRepository = new ProjectRepository(config.PROJECT_SEARCH_PATHS || []);

  return projectRepository;
}
