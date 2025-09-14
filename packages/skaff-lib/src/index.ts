import "reflect-metadata";

import type { CacheKey } from "./core/infra/cache-service";

export * from "./repositories";
export * from "./models";
export * from "./lib";
export * from "./actions";

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
export { llmProviderEnv, getConnectedProviders } from "./config/ai-providers";
export {
  advanceAiGeneration,
  type ConversationStepData,
} from "./services/ai-service";
export {
  resolveLanguageModel,
  resolveModelChoice,
} from "./services/ai-model-service";
export { getDefaultModelName } from "./lib/ai-model-utils";
