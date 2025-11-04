import type { DependencyContainer, InjectionToken } from "tsyringe";
import { Lifecycle } from "tsyringe";

import { AutoInstantiationSettingsAdjuster } from "../core/diffing/AutoInstantiationSettingsAdjuster";
import { DiffCache } from "../core/diffing/DiffCache";
import { ProjectDiffPlanner } from "../core/diffing/ProjectDiffPlanner";
import { TemporaryProjectFactory } from "../core/diffing/TemporaryProjectFactory";
import { CacheService } from "../core/infra/cache-service";
import { GitService } from "../core/infra/git-service";
import { NpmService } from "../core/infra/npm-service";
import { ShellService } from "../core/infra/shell-service";
import { TemplateGeneratorService } from "../core/generation/template-generator-service";
import { ProjectCreationManager } from "../core/projects/ProjectCreationManager";
import { TemplateConfigLoader } from "../core/templates/config/TemplateConfigLoader";
import { TemplateTreeBuilder } from "../core/templates/TemplateTreeBuilder";
import { ProjectRepository } from "../repositories/project-repository";
import {
  TemplatePathsProvider,
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
  TemplateConfigLoaderToken,
  TemplateGeneratorServiceToken,
  TemplatePathsProviderToken,
  TemplateTreeBuilderToken,
  TemporaryProjectFactoryToken,
} from "./tokens";

type Constructor<T> = new (...args: any[]) => T;

function registerClassSingleton<T>(
  container: DependencyContainer,
  token: InjectionToken<T>,
  ctor: Constructor<T>,
): void {
  container.register(token, { useClass: ctor }, { lifecycle: Lifecycle.Singleton });
}

export function registerInfrastructure(
  container: DependencyContainer,
): void {
  registerClassSingleton(container, CacheServiceToken, CacheService);
  registerClassSingleton(container, GitServiceToken, GitService);
  registerClassSingleton(container, NpmServiceToken, NpmService);
  registerClassSingleton(container, ShellServiceToken, ShellService);
  registerClassSingleton(container, DiffCacheToken, DiffCache);
  registerClassSingleton(
    container,
    AutoInstantiationSettingsAdjusterToken,
    AutoInstantiationSettingsAdjuster,
  );
  registerClassSingleton(
    container,
    TemporaryProjectFactoryToken,
    TemporaryProjectFactory,
  );
  registerClassSingleton(container, ProjectDiffPlannerToken, ProjectDiffPlanner);
  registerClassSingleton(container, ProjectRepositoryToken, ProjectRepository);
  container.register<TemplatePathsProvider>(TemplatePathsProviderToken, {
    useValue: defaultTemplatePathsProvider,
  });
  registerClassSingleton(
    container,
    TemplateConfigLoaderToken,
    TemplateConfigLoader,
  );
  registerClassSingleton(container, TemplateTreeBuilderToken, TemplateTreeBuilder);
  registerClassSingleton(
    container,
    RootTemplateRepositoryToken,
    RootTemplateRepository,
  );
  registerClassSingleton(
    container,
    TemplateGeneratorServiceToken,
    TemplateGeneratorService,
  );
  registerClassSingleton(
    container,
    ProjectCreationManagerToken,
    ProjectCreationManager,
  );
  registerClassSingleton(container, EsbuildInitializerToken, EsbuildInitializer);
}

export function registerDefaultServices(container: DependencyContainer): void {
  registerInfrastructure(container);
}
