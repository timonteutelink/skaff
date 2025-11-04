import type { InjectionToken } from "tsyringe";

import type { AutoInstantiationSettingsAdjuster } from "../core/diffing/AutoInstantiationSettingsAdjuster";
import type { DiffCache } from "../core/diffing/DiffCache";
import type { ProjectDiffPlanner } from "../core/diffing/ProjectDiffPlanner";
import type { TemporaryProjectFactory } from "../core/diffing/TemporaryProjectFactory";
import type { CacheService } from "../core/infra/cache-service";
import type { GitService } from "../core/infra/git-service";
import type { NpmService } from "../core/infra/npm-service";
import type { ShellService } from "../core/infra/shell-service";
import type { TemplateGeneratorService } from "../core/generation/template-generator-service";
import type { ProjectCreationManager } from "../core/projects/ProjectCreationManager";
import type { TemplateConfigLoader } from "../core/templates/config/TemplateConfigLoader";
import type { TemplateTreeBuilder } from "../core/templates/TemplateTreeBuilder";
import type { ProjectRepository } from "../repositories/project-repository";
import type { RootTemplateRepository } from "../repositories/root-template-repository";
import type { TemplatePathsProvider } from "../repositories/root-template-repository";
import type { EsbuildInitializer } from "../utils/get-esbuild";

function createToken<T>(description: string): InjectionToken<T> {
  return Symbol.for(`skaff:${description}`);
}

export const CacheServiceToken = createToken<CacheService>("CacheService");
export const GitServiceToken = createToken<GitService>("GitService");
export const NpmServiceToken = createToken<NpmService>("NpmService");
export const ShellServiceToken = createToken<ShellService>("ShellService");
export const DiffCacheToken = createToken<DiffCache>("DiffCache");
export const AutoInstantiationSettingsAdjusterToken =
  createToken<AutoInstantiationSettingsAdjuster>(
    "AutoInstantiationSettingsAdjuster",
  );
export const TemporaryProjectFactoryToken =
  createToken<TemporaryProjectFactory>("TemporaryProjectFactory");
export const ProjectDiffPlannerToken =
  createToken<ProjectDiffPlanner>("ProjectDiffPlanner");
export const ProjectRepositoryToken =
  createToken<ProjectRepository>("ProjectRepository");
export const RootTemplateRepositoryToken =
  createToken<RootTemplateRepository>("RootTemplateRepository");
export const TemplateGeneratorServiceToken =
  createToken<TemplateGeneratorService>("TemplateGeneratorService");
export const ProjectCreationManagerToken =
  createToken<ProjectCreationManager>("ProjectCreationManager");
export const TemplateConfigLoaderToken =
  createToken<TemplateConfigLoader>("TemplateConfigLoader");
export const TemplateTreeBuilderToken =
  createToken<TemplateTreeBuilder>("TemplateTreeBuilder");
export const TemplatePathsProviderToken =
  createToken<TemplatePathsProvider>("TemplatePathsProvider");
export const EsbuildInitializerToken =
  createToken<EsbuildInitializer>("EsbuildInitializer");

export const TOKENS = {
  CacheService: CacheServiceToken,
  GitService: GitServiceToken,
  NpmService: NpmServiceToken,
  ShellService: ShellServiceToken,
  DiffCache: DiffCacheToken,
  AutoInstantiationSettingsAdjuster: AutoInstantiationSettingsAdjusterToken,
  TemporaryProjectFactory: TemporaryProjectFactoryToken,
  ProjectDiffPlanner: ProjectDiffPlannerToken,
  ProjectRepository: ProjectRepositoryToken,
  RootTemplateRepository: RootTemplateRepositoryToken,
  TemplateGeneratorService: TemplateGeneratorServiceToken,
  ProjectCreationManager: ProjectCreationManagerToken,
  TemplateConfigLoader: TemplateConfigLoaderToken,
  TemplateTreeBuilder: TemplateTreeBuilderToken,
  TemplatePathsProvider: TemplatePathsProviderToken,
  EsbuildInitializer: EsbuildInitializerToken,
} as const;
