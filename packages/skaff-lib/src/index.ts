// Initialize the hardened environment as early as possible
import { initializeHardenedEnvironment } from "./core/infra/hardened-sandbox";
if (typeof window === "undefined") {
  initializeHardenedEnvironment();
}

import type { CacheKey } from "./core/infra/cache-service";

export * from "./repositories";
export * from "./models";
export * from "./lib";
export * from "./actions";
export * from "./core/generation/template-generator-service";
export {
  PipelineBuilder,
  PipelineRunner,
  type PipelineStage,
  type PipelinePhase,
  DEFAULT_PIPELINE_PHASE_ORDER,
} from "./core/generation/pipeline/pipeline-runner";
export {
  buildDefaultProjectCreationStages,
  buildDefaultTemplateInstantiationStages,
  ContextSetupStage,
  TemplateValidationStage,
  RenderStage,
  SideEffectsStage,
  PersistTemplateSettingsStage,
  AutoInstantiationStage,
  TargetPathStage,
  ProjectSetupStage,
  ProjectRenderingStage,
  ProjectSideEffectsStage,
  ProjectAutoInstantiationStage,
  type ProjectCreationPipelineContext,
  type TemplateInstantiationPipelineContext,
} from "./core/generation/pipeline/pipeline-stages";
export {
  TemplatePipelineContext,
  TargetPathResolver,
  TemplateFileMaterializer,
  SideEffectCoordinator,
  AutoInstantiationCoordinator,
} from "./core/generation/pipeline";
export {
  type GeneratorOptions,
  type TemplateGenerationPipelineOverrides,
  type TemplateGenerationPlugin,
  type TemplatePipelinePluginContext,
  type TemplatePluginEntrypoint,
} from "./core/generation/template-generation-types";
export * from "./core/plugins";

export { findTemplate, projectSearchPathKey } from "./utils/shared-utils";
export { CacheService, resolveCacheService } from "./core/infra/cache-service";
export { GitService, resolveGitService } from "./core/infra/git-service";
export {
  initializeHardenedEnvironment,
  isHardenedEnvironmentInitialized,
  HardenedSandboxService,
  resolveHardenedSandbox,
} from "./core/infra/hardened-sandbox";
export {
  getSandboxLibraries,
  getPluginSandboxLibraries,
  registerPluginSandboxLibraries,
} from "./core/infra/sandbox-endowments";
export {
  createDefaultContainer,
  getSkaffContainer,
  peekSkaffContainer,
  resetSkaffContainer,
  setSkaffContainer,
} from "./di/container";
export * from "./di/tokens";
export { createTestContainer, withTestContainer } from "./di/testing";
export type { CacheKey };
