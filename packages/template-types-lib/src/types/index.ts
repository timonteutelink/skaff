export type {
  UserTemplateSettings,
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
