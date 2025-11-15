import z from "zod";
import { HelperDelegate } from "handlebars";
import {
  StringOrCallback,
  UserTemplateSettings,
  AnyOrCallback,
  FinalTemplateSettings,
  AiResultsObject,
} from "./utils";
import { ProjectSettings } from "./project-settings-types";

/**
 * Interface representing all mandatory options for a template.
 */
export const templateConfigSchema = z.object({
  name: z
    .string()
    .nonempty()
    .min(2)
    .describe("The name of the template. Must match the parent directory name.")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "The name must only contain letters, numbers, or underscores.",
    ),
  author: z
    .string()
    .nonempty()
    .min(2)
    .describe("A description of the template."),

  description: z.string().optional().describe("Author"),

  specVersion: z
    .string()
    .nonempty()
    .min(1)
    .regex(/^\d+\.\d+\.\d+$/, "Must be in semver format")
    .describe("The version of the template specification being used."),

  multiInstance: z
    .boolean()
    .optional()
    .describe(
      "Whether the template can be used multiple times in the same project. Defaults to false.",
    ),
  isRootTemplate: z
    .boolean()
    .optional()
    .describe("Whether this template can be used to start a new project."),
});

// assuming output same type as input
export type TemplateConfig = z.infer<typeof templateConfigSchema>;

/**
 * Type representing a function that has side effects when generating a template.
 * @param templateSettings - The template settings the user inputted when generating the template.
 * @param oldFileContents - The old contents of the file to be edited, if any.
 * @returns The new contents of the file.
 */
export type SideEffectFunction<
  TFinalSettings extends FinalTemplateSettings = FinalTemplateSettings,
> = (
  templateSettings: TFinalSettings,
  oldFileContents?: string,
) => Promise<string | null>;

export type SideEffect<
  TFinalSettings extends FinalTemplateSettings = FinalTemplateSettings,
> = {
  apply: SideEffectFunction<TFinalSettings>;
  /**
   * The path to the file to be created or edited.
   * relative to project root
   * @example "./README.md"
   */
  filePath: string;
};

/**
 * Redirect of one of the subtemplates files or directories to another location based from project root.
 */
export type RedirectFile = {
  from: string;
  to: string;
};

/**
 * Allow the templating engine to overwrite these files
 * regex matching the path of the src file in the template relative to the templates/ folder
 * By default if a file in a template is found in the destination the engine will error.
 * ignore will not place the file and not error.
 * If multiple rules match the first will be used
 */
export type AllowOverwrite = {
  srcRegex: RegExp;
  mode: "overwrite" | "overwrite-warn" | "ignore" | "ignore-warn" | "error";
};

/**
 * Template that disables this template if it exists in the project.
 */
export type TemplateDisablingThis = {
  // TODO: Later we should also have a way to disable options on this template if any options on other templates are set.
  /**
   * The path to the template.
   * relative to project root
   * @example "project_github_folder"
   */
  templateName: string;

  /**
   * Objects that if the template contains all key value pairs as in this object then this template will be disabled.
   */
  specificSettings?: UserTemplateSettings[];
};

/**
 * Auto instantiate subtemplates.
 */
export type AutoInstantiatedSubtemplate<
  TFinalSettings extends FinalTemplateSettings = FinalTemplateSettings,
> = {
  /**
   * The path to the subtemplate.
   * relative to project root
   * @example "nix-project-flake"
   */
  subTemplateName: string;

  /**
   * Function to map the user settings to the subtemplate settings.
   * This function is called with the user settings and should return the subtemplate settings.
   */
  mapSettings: AnyOrCallback<TFinalSettings, UserTemplateSettings>; // TODO if this can be done nicely between a template and its children then we can allow the parent template to define the settings from the child in here. Then the type can also be used to extend the fullparentsettings type for the children down below. And the template dir can become fully typed. But we should first think how other git repos are handled(templates referencing other templates.) Before we allow parents to access types of children and all those references.

  /**
   * Array of children templates to also autoinstiate with this one.
   */
  children?: AutoInstantiatedSubtemplate<TFinalSettings>[];
};

export type TemplateCommand<
  TFinalSettings extends FinalTemplateSettings = FinalTemplateSettings,
> = {
  title: string;
  description: string;
  path?: string;
  command: StringOrCallback<TFinalSettings>;
};

export type AiContext = {
  description: string;
  relevantFiles?: string[];
};

export type TemplateParentReference = {
  templateName: string;
  repoUrl?: string;
  versionConstraint?: string;
};

export type LLMTools = {
  llm: (input: string) => Promise<string>;
};

//TODO: Ai settings will go in the tool env vars.
export type AiCallbackFunction<
  TFinalSettings extends FinalTemplateSettings = FinalTemplateSettings,
> = (
  llmTools: LLMTools,
  templateSettings: TFinalSettings,
) => Promise<Record<string, string>>;

export type AiAutoGenerateSettings<
  TFinalSettings extends FinalTemplateSettings = FinalTemplateSettings,
> = {
  expectedKeys: AnyOrCallback<TFinalSettings, string[]>;
  callback: AiCallbackFunction<TFinalSettings>;
};

export type AiUserConversationSettings<
  TFinalSettings extends FinalTemplateSettings = FinalTemplateSettings,
> = {
  expectedKeys: AnyOrCallback<TFinalSettings, string[]>;

  expectedResults: AnyOrCallback<TFinalSettings, string[]>;

  prompt: StringOrCallback<TFinalSettings>;

  // tools?
};

export interface TemplateMigration {
  uuid: string;
  previousMigration?: string;
  description?: string;
  migrate: (settings: UserTemplateSettings) => UserTemplateSettings;
}

/**
 * Interface representing the module to be exported from every templateConfig.ts file.
 * @template TSchemaType - The type of the schema used for template settings.
 */
export interface TemplateConfigModule<
  TParentFinalSettings extends FinalTemplateSettings,
  TInputSettingsSchema extends z.ZodAny,
  TFinalSettingsSchema extends z.ZodAny = TInputSettingsSchema,
  TAiResultsObject extends AiResultsObject = {},
  TInputSettings extends UserTemplateSettings = z.output<TInputSettingsSchema>,
  TFinalSettings extends FinalTemplateSettings = z.output<TFinalSettingsSchema>
> {
  /**
   * The target path for the template. Must be set on subtemplates.
   * relative to the project root
   * @default "."
   * @example "src"
   */
  targetPath?: StringOrCallback<TFinalSettings>;

  /**
   * Template base configuration options.
   */
  templateConfig: TemplateConfig;

  /**
   * Schema inputted by user before generating the template.
   */
  templateSettingsSchema: TInputSettingsSchema;

  /**
   * Schema expected when generating template. Might be same as templateSettingsSchema. Used to check template validity when loading.
   */
  templateFinalSettingsSchema: TFinalSettingsSchema;

  /**
   * The final settings type mapping after the user inputted settings are merged with the template settings.
   * This is the type that will be used to generate the template.
   */
  mapFinalSettings: (inputSettings: {
    fullProjectSettings: ProjectSettings;
    templateSettings: TInputSettings;
    parentSettings?: TParentFinalSettings;
    aiResults: TAiResultsObject;
  }) => TFinalSettings;

  /**
   * Schema describing the expected final settings from the parent template.
   * Required when this template is referenced from a different repository.
   */
  parentFinalSettingsSchema?: z.ZodType<TParentFinalSettings>;

  migrations?: TemplateMigration[];

  /**
   * Templates that when already existing in the project will disable the generation of this template.
   */
  templatesThatDisableThis?: TemplateDisablingThis[];

  /**
   * Side effects to be applied when generating the template.
   */
  sideEffects?: AnyOrCallback<
    TFinalSettings,
    SideEffect<TFinalSettings>[]
  >;

  /**
   * Redirects of files or directories to another location based from project root.
   */
  redirects?: AnyOrCallback<TFinalSettings, RedirectFile[]>;

  /**
   * Overwrite Rules
   */
  allowedOverwrites?: AnyOrCallback<TFinalSettings, AllowOverwrite[]>;

  /**
   * Auto instantiate subtemplates.
   */
  autoInstantiatedSubtemplates?: AnyOrCallback<
    TFinalSettings,
    AutoInstantiatedSubtemplate<TFinalSettings>[]
  >;

  /**
   * Assertions. Function must return true otherwise the template generation will fail.
   */
  assertions?: AnyOrCallback<TFinalSettings, boolean>;

  /**
   * A list of helper functions provided to handlebars before rendering the template.
   */
  handlebarHelpers?: Record<string, HelperDelegate>

  /**
   * A list of commands the user might want to run inside the project. Related to this template. Executed using bash.
   */
  commands?: TemplateCommand<TFinalSettings>[];

  /**
   * A description of this template. Usefull for the AI.
   * When instantiating a child template this description will be used to describe the the things this template adds.
   */
  aiContext?: AnyOrCallback<TFinalSettings, AiContext>;

  /**
   * Ai auto generation settings.
   * This is invoked to add ai generated vars to the template.
   * Provides the expected keys the ai will produce.
   * In the template ai_results will be a Record string string where the expected keys are the ones provided here.
   * These have to be provided to generate the template so this function needs to return these keys.
   */
  aiAutoGenerate?: AiAutoGenerateSettings<TFinalSettings>;

  /**
   * Ai user conversation settings.
   * These settings are used to start a conversation with the user. After the conversation is resolved the ai will call the final conversation ending tool and the ai should provide the expected keys otherwise generation will fail. Allow the user to retry a conversation if the ai doesnt provide the keys or if the user wants to modify the keys. Show all results to user before actually using the ai generated results in the template. All ai results will also go inside the templateSettings. Bit ugly but otherwise needs to go in a hidden file or a subdir.
   */
  aiUserConversationSettings?: AiUserConversationSettings<TFinalSettings>[];

  /**
   * Optional references to parent templates that may host this template as a detached subtree.
   */
  possibleParentTemplates?: TemplateParentReference[];
}
