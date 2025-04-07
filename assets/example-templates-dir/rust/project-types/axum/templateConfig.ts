import { z } from 'zod';
import { TemplateConfig, TemplateConfigModule, SideEffectFunction } from '@timonteutelink/template-types-lib';

const templateSettingsSchema = z.object({
});

const templateConfig: TemplateConfig = {
	name: 'axum',
	description: 'Axum template',
	author: "Timon Teutelink"
};

const templateConfigModule: TemplateConfigModule<z.infer<typeof templateSettingsSchema>> = {
	templateConfig,
	targetPath: 'src',
	templateSettingsSchema,
	sideEffects: [
	]
};

export default templateConfigModule;

