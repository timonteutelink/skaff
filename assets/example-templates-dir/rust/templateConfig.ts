import { z } from 'zod';
import { TemplateConfig, TemplateConfigModule, SideEffectFunction } from '@timonteutelink/template-types-lib';

const templateSettingsSchema = z.object({
	author: z.string().optional(),
});

export type TemplateSettings = z.infer<typeof templateSettingsSchema>;

// can be done with a file in templates folder in this case just testing the sideeffects
const sideEffectFunction: SideEffectFunction<TemplateSettings> = (templateSettings, oldFileContents) => {
	return `Project Name: ${""}\nAuthor: ${templateSettings.author || 'Unknown'}`;
};

const templateConfig: TemplateConfig = {
	name: 'rust',
	description: 'Rust template',
	author: "Timon Teutelink"
};

const templateConfigModule: TemplateConfigModule<TemplateSettings> = {
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

