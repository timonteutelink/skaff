export type {
  UserTemplateSettings,
  FinalTemplateSettings,
  StringOrCallback,
  AnyOrCallback,
} from "./utils";

export type {
  TemplateConfig,
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

// Sandbox-safe types for template and plugin code
export type {
  ReadonlyProjectContext,
  ReadonlyInstantiatedTemplate,
  ReadonlyTemplateView,
  PluginScopedContext,
  MapFinalSettingsInput,
  PluginComputeOutputInput,
  TemplateCallbackContext,
} from "./sandbox-safe-types";

export {
  createReadonlyProjectContext,
  createReadonlyTemplateView,
} from "./sandbox-safe-types";

// Plugin settings types
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

export {
  instantiatedTemplateSchema,
  projectSettingsSchema,
  projectRepositoryNameRegex,
} from "./project-settings-types";
export { templateConfigSchema } from "./template-config-types";
