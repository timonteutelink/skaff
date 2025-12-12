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

export {
  instantiatedTemplateSchema,
  projectSettingsSchema,
  projectRepositoryNameRegex,
} from "./project-settings-types";
export { templateConfigSchema } from "./template-config-types";
