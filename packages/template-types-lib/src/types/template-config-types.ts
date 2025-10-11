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

export type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
export interface AiModel {
  provider: string;
  name: string;
}

export type AiModelCategory = {
  description: string;
};

export type TemplateParentReference = {
  templateName: string;
  repoUrl?: string;
  versionConstraint?: string;
};

export interface AiAutoAgent {
  model?: unknown;
  llms?: unknown[];
  tools?: Record<string, unknown>;
  agents?: Record<string, unknown>;
  run: (prompt: string, context: string[]) => Promise<string>;
}

export interface AiConversationAgent {
  model?: unknown;
  llms?: unknown[];
  tools?: Record<string, unknown>;
  agents?: Record<string, unknown>;
  run: (messages: AiMessage[], context: string[]) => Promise<string>;
}

export type BuildAutoAgent<
  TFinalSettings extends FinalTemplateSettings = FinalTemplateSettings,
> = (
  settings: TFinalSettings & { aiResults: AiResultsObject },
  model: AiModel | undefined,
  step: AiAutoGenerationStep<TFinalSettings>,
) => Promise<AiAutoAgent>;

export type BuildConversationAgent<
  TFinalSettings extends FinalTemplateSettings = FinalTemplateSettings,
> = (
  settings: TFinalSettings & { aiResults: AiResultsObject },
  model: AiModel | undefined,
  step: AiConversationGenerationStep<TFinalSettings>,
) => Promise<AiConversationAgent>;

export type AiAutoGenerationStep<
  TFinalSettings extends FinalTemplateSettings = FinalTemplateSettings,
> = {
  type: "auto";
  resultKey: string;
  modelKey?: string;
  prompt?: StringOrCallback<TFinalSettings>;
  contextPaths?: AnyOrCallback<TFinalSettings, string[]>;
  run?: (
    agent: AiAutoAgent,
    settings: TFinalSettings & { aiResults: AiResultsObject },
    context: string[],
  ) => Promise<string>;
  dependsOn?: string[];
};

export type AiConversationGenerationStep<
  TFinalSettings extends FinalTemplateSettings = FinalTemplateSettings,
> = {
  type: "conversation";
  resultKey: string;
  modelKey?: string;
  messages?: AnyOrCallback<TFinalSettings, AiMessage[]>;
  contextPaths?: AnyOrCallback<TFinalSettings, string[]>;
  run?: (
    agent: AiConversationAgent,
    settings: TFinalSettings & { aiResults: AiResultsObject },
    context: string[],
  ) => Promise<string>;
  dependsOn?: string[];
};

export type AiGenerationStep<
  TFinalSettings extends FinalTemplateSettings = FinalTemplateSettings,
> =
  | AiAutoGenerationStep<TFinalSettings>
  | AiConversationGenerationStep<TFinalSettings>;

export type AiGeneration<
  TFinalSettings extends FinalTemplateSettings = FinalTemplateSettings,
> = {
  steps: AiGenerationStep<TFinalSettings>[];
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
  TInputSettingsSchema extends z.AnyZodObject,
  TFinalSettingsSchema extends z.AnyZodObject = TInputSettingsSchema,
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
   * A simple high level description of the template.
   */
  aiDescription?: AnyOrCallback<TFinalSettings, string>;

  /**
   * A very technical and in depth description of the files this template adds.
   */
  aiTechnicalDescription?: AnyOrCallback<TFinalSettings, string>;

  /**
   * Optional references to parent templates that may host this template as a detached subtree.
   */
  possibleParentTemplates?: TemplateParentReference[];

  /**
   * Categories of AI models this template can utilize.
   * The user must supply actual models for these categories when generating.
   */
  aiModelCategories?: Record<string, AiModelCategory>;

  /**
   * AI generation settings. Multiple steps can run and depend on each other.
   */
  aiGeneration?: AiGeneration<TFinalSettings>;

  /**
   * Optional builder to customize auto generation agent behaviour.
   */
  buildAutoAgent?: BuildAutoAgent<TFinalSettings>;

  /**
   * Optional builder to customize conversational agent behaviour.
   */
  buildConversationAgent?: BuildConversationAgent<TFinalSettings>;

  /**
   * File paths from parent templates to include as context.
   */
  parentContextPaths?: AnyOrCallback<TFinalSettings, string[]>;
}
