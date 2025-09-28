import type { DependencyContainer } from "tsyringe";

import { AutoInstantiationSettingsAdjuster } from "../core/diffing/AutoInstantiationSettingsAdjuster";
import { CacheService } from "../core/infra/cache-service";
import { DiffCache } from "../core/diffing/DiffCache";
import { ProjectDiffPlanner } from "../core/diffing/ProjectDiffPlanner";
import { FileSystemService } from "../core/infra/file-service";
import { NpmService } from "../core/infra/npm-service";
import { ShellService } from "../core/infra/shell-service";
import { TemporaryProjectFactory } from "../core/diffing/TemporaryProjectFactory";
import { GitService } from "../core/infra/git-service";
import { ProjectRepository } from "../repositories/project-repository";
import { RootTemplateRepository } from "../repositories/root-template-repository";
import { TemplateGeneratorService } from "../core/generation/template-generator-service";
import { ProjectCreationManager } from "../core/projects/ProjectCreationManager";

export function registerInfrastructure(
  container: DependencyContainer,
): void {
  container.registerSingleton(FileSystemService);
  container.registerSingleton(CacheService);
  container.registerSingleton(GitService);
  container.registerSingleton(NpmService);
  container.registerSingleton(ShellService);
  container.registerSingleton(DiffCache);
  container.registerSingleton(AutoInstantiationSettingsAdjuster);
  container.registerSingleton(TemporaryProjectFactory);
  container.registerSingleton(ProjectDiffPlanner);
  container.registerSingleton(ProjectRepository);
  container.registerSingleton(RootTemplateRepository);
  container.registerSingleton(TemplateGeneratorService);
  container.registerSingleton(ProjectCreationManager);
}

export function registerDefaultServices(container: DependencyContainer): void {
  registerInfrastructure(container);
}
