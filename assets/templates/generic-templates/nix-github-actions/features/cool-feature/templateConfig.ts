import { z } from 'zod';
import { TemplateConfig, TemplateConfigModule } from '@timonteutelink/template-types-lib';

const templateSettingsSchema = z.object({
});

const templateConfig: TemplateConfig = {
	name: 'nix-github-actions-cool-feature',
	description: 'Github actions nix',
	author: "Timon Teutelink"
};

const templateConfigModule: TemplateConfigModule<z.infer<typeof templateSettingsSchema>> = {
	templateConfig,
	targetPath: '.',
	templateSettingsSchema,

	sideEffects: [
	]
};

export default templateConfigModule;
