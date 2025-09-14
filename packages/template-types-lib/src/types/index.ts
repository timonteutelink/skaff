export type {
  UserTemplateSettings,
  AiResultsObject,
  FinalTemplateSettings,
  StringOrCallback,
  AnyOrCallback,
} from "./utils";

export type {
  TemplateConfig,
  SideEffectFunction,
  SideEffect,
  RedirectFile,
  TemplateDisablingThis,
  AllowOverwrite,
  AutoInstantiatedSubtemplate,
  TemplateCommand,
  AiMessage,
  AiModel,
  AiModelCategory,
  AiAutoAgent,
  AiConversationAgent,
  BuildAutoAgent,
  BuildConversationAgent,
  AiGenerationStep,
  AiGeneration,
  TemplateConfigModule,
  TemplateMigration,
} from "./template-config-types";

export type {
  InstantiatedTemplate,
  ProjectSettings,
} from "./project-settings-types";

export { instantiatedTemplateSchema, projectSettingsSchema, projectNameRegex } from "./project-settings-types";
export { templateConfigSchema } from "./template-config-types";
