import { getSkaffContainer } from "../di/container";
import {
  ProjectRepositoryToken,
  RootTemplateRepositoryToken,
} from "../di/tokens";
import type { ProjectRepository } from "./project-repository";
import type { RootTemplateRepository } from "./root-template-repository";

export function resolveRootTemplateRepository(): RootTemplateRepository {
  return getSkaffContainer().resolve(RootTemplateRepositoryToken);
}

export function resolveProjectRepository(): ProjectRepository {
  return getSkaffContainer().resolve(ProjectRepositoryToken);
}
