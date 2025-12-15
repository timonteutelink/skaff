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

// New naming convention for plugin settings
export type {
  PluginGlobalConfig,
  PluginInputSettings,
  PluginOutputSettings,
} from "./plugin-settings-schemas";

export {
  pluginGlobalConfigSchema,
  pluginInputSchema,
  pluginOutputSchema,
} from "./plugin-settings-schemas";

// DEPRECATED: Legacy exports for backwards compatibility
// These will be removed in a future major version.
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
