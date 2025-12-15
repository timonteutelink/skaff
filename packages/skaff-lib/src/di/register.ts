import type { ServiceContainer } from "./container";

import { AutoInstantiationSettingsAdjuster } from "../core/diffing/AutoInstantiationSettingsAdjuster";
import { DiffCache } from "../core/diffing/DiffCache";
import { ProjectDiffPlanner } from "../core/diffing/ProjectDiffPlanner";
import { TemporaryProjectFactory } from "../core/diffing/TemporaryProjectFactory";
import { CacheService } from "../core/infra/cache-service";
import { GitService } from "../core/infra/git-service";
import { NpmService } from "../core/infra/npm-service";
import { ShellService } from "../core/infra/shell-service";
import { HardenedSandboxService } from "../core/infra/hardened-sandbox";
import { TemplateGeneratorService } from "../core/generation/template-generator-service";
import { ProjectCreationManager } from "../core/projects/ProjectCreationManager";
import { TemplateConfigLoader } from "../core/templates/config/TemplateConfigLoader";
import { TemplateTreeBuilder } from "../core/templates/TemplateTreeBuilder";
import { ProjectRepository } from "../repositories/project-repository";
import {
  RootTemplateRepository,
  defaultTemplatePathsProvider,
} from "../repositories/root-template-repository";
import { EsbuildInitializer } from "../utils/get-esbuild";
import {
  AutoInstantiationSettingsAdjusterToken,
  CacheServiceToken,
  DiffCacheToken,
  EsbuildInitializerToken,
  GitServiceToken,
  NpmServiceToken,
  ProjectCreationManagerToken,
  ProjectDiffPlannerToken,
  ProjectRepositoryToken,
  RootTemplateRepositoryToken,
  ShellServiceToken,
  HardenedSandboxServiceToken,
  TemplateConfigLoaderToken,
  TemplateGeneratorServiceToken,
  TemplatePathsProviderToken,
  TemplateTreeBuilderToken,
  TemporaryProjectFactoryToken,
} from "./tokens";

/**
 * Registers all infrastructure and application services with the container.
 * Services are registered with factory functions that receive the container
 * for resolving their dependencies.
 */
export function registerDefaultServices(container: ServiceContainer): void {
  // --- Infrastructure services (no dependencies) ---

  container.register(CacheServiceToken, () => new CacheService());

  container.register(NpmServiceToken, () => new NpmService());

  container.register(ShellServiceToken, () => new ShellService());

  container.register(
    HardenedSandboxServiceToken,
    () => new HardenedSandboxService(),
  );

  container.register(EsbuildInitializerToken, () => new EsbuildInitializer());

  container.register(
    AutoInstantiationSettingsAdjusterToken,
    () => new AutoInstantiationSettingsAdjuster(),
  );

  container.register(ProjectRepositoryToken, () => new ProjectRepository());

  // --- Infrastructure services (with dependencies) ---

  container.register(
    GitServiceToken,
    (c) =>
      new GitService(c.resolve(CacheServiceToken), c.resolve(NpmServiceToken)),
  );

  container.register(
    DiffCacheToken,
    (c) => new DiffCache(c.resolve(CacheServiceToken)),
  );

  // --- Template services ---

  container.register(
    TemplateConfigLoaderToken,
    (c) =>
      new TemplateConfigLoader(
        c.resolve(CacheServiceToken),
        c.resolve(EsbuildInitializerToken),
        c.resolve(HardenedSandboxServiceToken),
      ),
  );

  container.register(
    TemplateTreeBuilderToken,
    (c) =>
      new TemplateTreeBuilder(
        c.resolve(GitServiceToken),
        c.resolve(TemplateConfigLoaderToken),
      ),
  );

  // TemplatePathsProvider is a function, not a class
  container.registerInstance(
    TemplatePathsProviderToken,
    defaultTemplatePathsProvider,
  );

  container.register(
    RootTemplateRepositoryToken,
    (c) =>
      new RootTemplateRepository(
        c.resolve(TemplateTreeBuilderToken),
        c.resolve(GitServiceToken),
        c.resolve(TemplatePathsProviderToken),
      ),
  );

  // --- Generation services ---

  container.register(
    TemplateGeneratorServiceToken,
    (c) => new TemplateGeneratorService(c.resolve(GitServiceToken)),
  );

  container.register(
    ProjectCreationManagerToken,
    (c) =>
      new ProjectCreationManager(
        c.resolve(ProjectRepositoryToken),
        c.resolve(RootTemplateRepositoryToken),
        c.resolve(GitServiceToken),
        c.resolve(TemplateGeneratorServiceToken),
      ),
  );

  // --- Diffing services ---

  container.register(
    TemporaryProjectFactoryToken,
    (c) =>
      new TemporaryProjectFactory(
        c.resolve(DiffCacheToken),
        c.resolve(ProjectCreationManagerToken),
      ),
  );

  container.register(
    ProjectDiffPlannerToken,
    (c) =>
      new ProjectDiffPlanner(
        c.resolve(DiffCacheToken),
        c.resolve(AutoInstantiationSettingsAdjusterToken),
        c.resolve(TemporaryProjectFactoryToken),
        c.resolve(RootTemplateRepositoryToken),
        c.resolve(GitServiceToken),
      ),
  );
}
