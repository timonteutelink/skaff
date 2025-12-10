import "reflect-metadata";

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

export { findTemplate, projectSearchPathKey } from "./utils/shared-utils";
export { CacheService, resolveCacheService } from "./core/infra/cache-service";
export { GitService, resolveGitService } from "./core/infra/git-service";
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
