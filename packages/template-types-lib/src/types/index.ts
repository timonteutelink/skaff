export type {
  UserTemplateSettings,
  FinalTemplateSettings,
  StringOrCallback,
  AnyOrCallback,
} from "./utils";

export type {
  TemplateConfig,
  SideEffectFunction,
  SideEffectInput,
  SideEffectTransform,
  SideEffect,
  RedirectFile,
  TemplateDisablingThis,
  AllowOverwrite,
  AutoInstantiatedSubtemplate,
  TemplateCommand,
  TemplateConfigModule,
  TemplateMigration,
  TemplateParentReference,
  TemplatePluginConfig,
} from "./template-config-types";

export type {
  InstantiatedTemplate,
  ProjectSettings,
} from "./project-settings-types";
export type {
  PluginSystemSettings,
  PluginAdditionalTemplateSettings,
  PluginFinalSettings,
} from "./plugin-settings-schemas";

// Sandbox-safe types for secure plugin/template execution
export type {
  ReadonlyInstantiatedTemplate,
  ReadonlyProjectSettings,
  ReadonlyTemplateView,
  PluginScopedContext,
  MapFinalSettingsInput,
  PluginFinalSettingsInput,
  TemplateCallbackContext,
} from "./sandbox-safe-types";

export {
  createReadonlyProjectSettings,
  createReadonlyTemplateView,
} from "./sandbox-safe-types";

export {
  pluginSystemSettingsSchema,
  pluginAdditionalTemplateSettingsSchema,
  pluginFinalSettingsSchema,
} from "./plugin-settings-schemas";

export {
  instantiatedTemplateSchema,
  projectSettingsSchema,
  projectRepositoryNameRegex,
} from "./project-settings-types";
export { templateConfigSchema } from "./template-config-types";
