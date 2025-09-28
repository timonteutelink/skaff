import { getSkaffContainer } from "../di/container";
import { ProjectRepository } from "./project-repository";
import { RootTemplateRepository } from "./root-template-repository";

export function resolveRootTemplateRepository(): RootTemplateRepository {
  return getSkaffContainer().resolve(RootTemplateRepository);
}

export function resolveProjectRepository(): ProjectRepository {
  return getSkaffContainer().resolve(ProjectRepository);
}
