import z from "zod";
import { HelperDelegate } from "handlebars";
import {
  StringOrCallback,
  UserTemplateSettings,
  TemplateSettingsType,
  AnyOrCallback,
} from "./utils";

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
  multiInstance: z
    .boolean()
    .optional()
    .describe(
      "Whether the template can be used multiple times in the same project. Defaults to false.",
    ),
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
  TFullSettingsType extends
  TemplateSettingsType<z.AnyZodObject> = TemplateSettingsType<z.AnyZodObject>,
> = (
  templateSettings: TFullSettingsType,
  oldFileContents?: string,
) => Promise<string>;

export type SideEffect<
  TFullSettingsType extends
  TemplateSettingsType<z.AnyZodObject> = TemplateSettingsType<z.AnyZodObject>,
> = {
  apply: SideEffectFunction<TFullSettingsType>;
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
  srcRegex: RegExp,
  mode: 'overwrite' | 'overwrite-warn' | 'ignore' | 'ignore-warn' | 'error'
}

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
}

/**
 * Auto instantiate subtemplates.
 */
export type AutoInstantiatedSubtemplate<
  TFullSettingsType extends
  TemplateSettingsType<z.AnyZodObject> = TemplateSettingsType<z.AnyZodObject>,
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
  mapSettings: AnyOrCallback<TFullSettingsType, UserTemplateSettings>;// TODO if this can be done nicely between a template and its children then we can allow the parent template to define the settings from the child in here. Then the type can also be used to extend the fullparentsettings type for the children down below. And the template dir can become fully typed. But we should first think how other git repos are handled(templates referencing other templates.) Before we allow parents to access types of children and all those references.

  /**
   * Array of children templates to also autoinstiate with this one.
   */
  children?: AutoInstantiatedSubtemplate<TFullSettingsType>[];
};

export type TemplateCommand<
  TFullSettingsType extends
  TemplateSettingsType<z.AnyZodObject> = TemplateSettingsType<z.AnyZodObject>,
> = {
  title: string;
  description: string;
  command: StringOrCallback<TFullSettingsType>;
}

export type AiContext = {
  description: string;
  relevantFiles?: string[];
};

export type LLMTools = {
  llm: (input: string) => Promise<string>;
  llmWithAllContext: (input: string) => Promise<string>;
};

//TODO: Ai settings will go in the tool env vars.
export type AiCallbackFunction<
  TFullSettingsType extends
  TemplateSettingsType<z.AnyZodObject> = TemplateSettingsType<z.AnyZodObject>,
> = (
  llmTools: LLMTools,
  templateSettings: TFullSettingsType,
) => Promise<Record<string, string>>;

export type AiAutoGenerateSettings<
  TFullSettingsType extends
  TemplateSettingsType<z.AnyZodObject> = TemplateSettingsType<z.AnyZodObject>,
> = {
  expectedKeys: AnyOrCallback<TFullSettingsType, string[]>;
  callback: AiCallbackFunction<TFullSettingsType>;
};

export type AiUserConversationSettings<
  TFullSettingsType extends
  TemplateSettingsType<z.AnyZodObject> = TemplateSettingsType<z.AnyZodObject>,
> = {
  expectedKeys: AnyOrCallback<TFullSettingsType, string[]>;

  expectedResults: AnyOrCallback<TFullSettingsType, string[]>;

  prompt: StringOrCallback<TFullSettingsType>;

  // tools?
};

/**
 * Interface representing the module to be exported from every templateConfig.ts file.
 * @template TSchemaType - The type of the schema used for template settings.
 */
export interface TemplateConfigModule<
  TFullSettingsType extends TemplateSettingsType<
    TSettingsType,
    UserTemplateSettings
  >,
  TSettingsType extends z.AnyZodObject,
> {
  /**
   * The target path for the template. Must be set on subtemplates.
   * relative to the project root
   * @default "."
   * @example "src"
   */
  targetPath?: StringOrCallback<TFullSettingsType>;

  /**
   * Template base configuration options.
   */
  templateConfig: TemplateConfig;

  /**
   * Schema inputted by user before generating the template.
   */
  templateSettingsSchema: TSettingsType;

  /**
   * Templates that when already existing in the project will disable the generation of this template.
   */
  templatesThatDisableThis?: TemplateDisablingThis[];

  /**
   * Side effects to be applied when generating the template.
   */
  sideEffects?: AnyOrCallback<TFullSettingsType, SideEffect<TFullSettingsType>[]>;

  /**
   * Redirects of files or directories to another location based from project root.
   */
  redirects?: AnyOrCallback<TFullSettingsType, RedirectFile[]>;

  /**
   * Overwrite Rules
   */
  allowedOverwrites?: AnyOrCallback<TFullSettingsType, AllowOverwrite[]>;

  /**
   * Auto instantiate subtemplates.
   */
  autoInstantiatedSubtemplates?: AnyOrCallback<TFullSettingsType, AutoInstantiatedSubtemplate<TFullSettingsType>[]>;

  /**
   * Assertions. Function must return true otherwise the template generation will fail.
   */
  assertions?: AnyOrCallback<TFullSettingsType, boolean>;

  /**
   * A list of helper functions provided to handlebars before rendering the template.
   */
  handlebarHelpers?: AnyOrCallback<TFullSettingsType, Record<string, HelperDelegate>>;

  /**
   * A list of commands the user might want to run inside the project. Related to this template. Executed using bash.
   */
  commands?: TemplateCommand<TFullSettingsType>[];

  /**
   * A description of this template. Usefull for the AI.
   * When instantiating a child template this description will be used to describe the the things this template adds.
   */
  aiContext?: AnyOrCallback<TFullSettingsType, AiContext>;

  /**
   * Ai auto generation settings.
   * This is invoked to add ai generated vars to the template.
   * Provides the expected keys the ai will produce.
   * In the template ai_results will be a Record<string, string> where the expected keys are the ones provided here.
   * These have to be provided to generate the template so this function needs to return these keys.
   */
  aiAutoGenerate?: AiAutoGenerateSettings<TFullSettingsType>;

  /**
   * Ai user conversation settings.
   * These settings are used to start a conversation with the user. After the conversation is resolved the ai will call the final conversation ending tool and the ai should provide the expected keys otherwise generation will fail. Allow the user to retry a conversation if the ai doesnt provide the keys or if the user wants to modify the keys. Show all results to user before actually using the ai generated results in the template. All ai results will also go inside the templateSettings. Bit ugly but otherwise needs to go in a hidden file or a subdir.
   */
  aiUserConversationSettings?: AiUserConversationSettings<TFullSettingsType>[];
}
