import { z } from 'zod';
import { TemplateConfig, TemplateConfigModule } from '@timonteutelink/template-types-lib';

const templateSettingsSchema = z.object({
	repo: z.string().optional(),
});

const templateConfig: TemplateConfig = {
	name: 'nix-github-actions',
	description: 'Github actions nix',
	author: "Timon Teutelink"
};

const templateConfigModule: TemplateConfigModule<z.infer<typeof templateSettingsSchema>> = {
	templateConfig,
	targetPath: '.github/workflows/',
	templateSettingsSchema,
	sideEffects: [
	]
};

export default templateConfigModule;


