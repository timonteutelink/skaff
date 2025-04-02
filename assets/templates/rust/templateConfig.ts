import { z } from 'zod';
import { TemplateConfig, TemplateConfigModule, SideEffectFunction } from '@timonteutelink/template-types-lib';

const templateSettingsSchema = z.object({
	projectName: z.string(),
	author: z.string().optional(),
});

// can be done with a file in templates folder in this case just testing the sideeffects
const sideEffectFunction: SideEffectFunction<z.infer<typeof templateSettingsSchema>> = (templateSettings, oldFileContents) => {
	return `Project Name: ${templateSettings.projectName}\nAuthor: ${templateSettings.author || 'Unknown'}`;
};

const templateConfig: TemplateConfig = {
	name: 'rust',
	description: 'Rust template',
	author: "Timon Teutelink"

};

const templateConfigModule: TemplateConfigModule<z.infer<typeof templateSettingsSchema>> = {
	templateConfig,
	targetPath: '.',
	templateSettingsSchema,
	sideEffects: [
		{
			filePath: () => './README.md',
			apply: sideEffectFunction,
		},
	]
};

export default templateConfigModule;

