import { z } from 'zod';
import { StringOrCallback, UserTemplateSettings } from './utils';

/**
 * Interface representing all mandatory options for a template.
 */
export const templateConfigSchema = z.object({
	name: z.string().nonempty().min(2).describe("The name of the template. Must match the parent directory name."),
	author: z.string().nonempty().min(2).describe("A description of the template."),

	description: z.string().optional().describe("Author")
})


// assuming output same type as input
export type TemplateConfig = z.infer<typeof templateConfigSchema>;

/**
 * Type representing a function that has side effects when generating a template.
 * @param templateSettings - The template settings the user inputted when generating the template.
 * @param oldFileContents - The old contents of the file to be edited, if any.
 * @returns The new contents of the file.
 */
export type SideEffectFunction<T extends UserTemplateSettings> = (projectName: string, templateSettings: T, oldFileContents?: string) => string;

export type SideEffect<T extends UserTemplateSettings> = {
	apply: SideEffectFunction<T>;
	/**
	 * The path to the file to be created or edited.
	 * relative to project root
	 * @example "./README.md"
	 */
	filePath: StringOrCallback<T>;
};

/**
 * Interface representing the module to be exported from every templateConfig.ts file.
 * @template TSchemaType - The type of the schema used for template settings.
 */
//TODO: add TParentSchemaType parent settings as seperate generic. This will be aggregated with the TSchemaType for the sideeffects and targetPath
export interface TemplateConfigModule<TSchemaType extends UserTemplateSettings> {
	/**
	 * The target path for the template. Must be set on subtemplates.
	 * relative to the project root
	 * @default "."
	 * @example "src"
	 */
	targetPath?: StringOrCallback<TSchemaType>;

	/**
	 * Template base configuration options.
	 */
	templateConfig: TemplateConfig;

	/**
	 * Schema inputted by user before generating the template.
	 */
	templateSettingsSchema: z.ZodSchema<TSchemaType, any, any>;

	/**
	 * An object with as keys the paths to the files to be created or edited, and as values a function that returns the new content of the file of this file at the given path.
	 */
	sideEffects: SideEffect<TSchemaType>[];
}
