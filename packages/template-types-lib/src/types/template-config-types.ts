import { z } from 'zod';
import { StringOrCallback, UserTemplateSettings, TemplateSettingsType } from './utils';

/**
 * Interface representing all mandatory options for a template.
 */
export const templateConfigSchema = z.object({
	name: z.string().nonempty().min(2).describe("The name of the template. Must match the parent directory name.").regex(/^[a-zA-Z0-9_]+$/, "The name must only contain letters, numbers, or underscores."),
	author: z.string().nonempty().min(2).describe("A description of the template."),

	description: z.string().optional().describe("Author"),
	multiInstance: z.boolean().optional().describe("Whether the template can be used multiple times in the same project. Defaults to false."),
})


// assuming output same type as input
export type TemplateConfig = z.infer<typeof templateConfigSchema>;

/**
 * Type representing a function that has side effects when generating a template.
 * @param templateSettings - The template settings the user inputted when generating the template.
 * @param oldFileContents - The old contents of the file to be edited, if any.
 * @returns The new contents of the file.
 */
export type SideEffectFunction<TFullSettingsType extends TemplateSettingsType<z.AnyZodObject> = TemplateSettingsType<z.AnyZodObject>> = (templateSettings: TFullSettingsType, oldFileContents?: string) => Promise<string>;

export type SideEffect<TFullSettingsType extends TemplateSettingsType<z.AnyZodObject> = TemplateSettingsType<z.AnyZodObject>> = {
	apply: SideEffectFunction<TFullSettingsType>;
	/**
	 * The path to the file to be created or edited.
	 * relative to project root
	 * @example "./README.md"
	 */
	filePath: StringOrCallback<TFullSettingsType>;
};

/**
 * Interface representing the module to be exported from every templateConfig.ts file.
 * @template TSchemaType - The type of the schema used for template settings.
 */
//TODO: add TParentSchemaType parent settings as seperate generic. This will be aggregated with the TSchemaType for the sideeffects and targetPath
export interface TemplateConfigModule<TFullSettingsType extends TemplateSettingsType<TSettingsType, UserTemplateSettings>, TSettingsType extends z.AnyZodObject> {
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
	 * An object with as keys the paths to the files to be created or edited, and as values a function that returns the new content of the file of this file at the given path.
	 */
	sideEffects: SideEffect<TFullSettingsType>[];
}
