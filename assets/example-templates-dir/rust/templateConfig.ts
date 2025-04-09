import { z } from 'zod';
import { TemplateConfig, TemplateConfigModule, SideEffectFunction, TemplateSettingsType } from '@timonteutelink/template-types-lib';

const templateSettingsSchema = z.object({
	author: z.string(),
	license: z.enum(['MIT', 'Apache-2.0']).optional(),
	coolStuff: z.boolean().optional(),
});

export type FullTemplateSettings = TemplateSettingsType<typeof templateSettingsSchema>;

// can be done with a file in templates folder in this case just testing the sideeffects
const sideEffectFunction: SideEffectFunction<FullTemplateSettings> = (templateSettings, oldFileContents) => {
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

