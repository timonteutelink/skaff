import { z } from 'zod';
import { TemplateConfig, TemplateConfigModule, SideEffectFunction, TemplateSettingsType } from '@timonteutelink/template-types-lib';
// allow redirect of a path of this subtemplate to another location relative to project root
// Allow templates to automatically instatiate others. This way we can for example extract the .envrc to a seperate template and reference it from every other template.
// If after templating with handlebars a file contains { "TEMPLATE_FILE_REF": "../" } we can somehow include also that referenced file and template it. Then next to importing individual files from other locations we also allow importing templates with the provided settings. Even though this should use a subtemplate we should have also this way to automate instatiation of templates.

// fix all error handling, proper communication to frontend but also rollbacks when template generation fails. Use git in existing projects to enforce this and in new projects we can delete the project on error.
const templateSettingsSchema = z.object({
	author: z.string(),
	license: z.enum(['MIT', 'Apache-2.0']).optional(),
	coolStuff: z.boolean().optional(),
});

export type FullTemplateSettings = TemplateSettingsType<typeof templateSettingsSchema>;

// can be done with a file in templates folder in this case just testing the sideeffects
const sideEffectFunction: SideEffectFunction<FullTemplateSettings> = async (templateSettings, oldFileContents) => {
	return `Project Name: ${""}\nAuthor: ${templateSettings.author || 'Unknown'}`;
};

const templateConfig: TemplateConfig = {
	name: 'rust',
	description: 'Rust template',
	author: "Timon Teutelink"
};

// describe chat for user to have when generating template
// And also be able to describe a workflow using ai to generate a part of template automatically.
const templateConfigModule: TemplateConfigModule<FullTemplateSettings, typeof templateSettingsSchema> = {
	templateConfig,
	targetPath: '.',
	templateSettingsSchema,
	sideEffects: [
		{
			filePath: (banana) => './README.md',
			apply: sideEffectFunction,
		},
	]
};

export default templateConfigModule;

