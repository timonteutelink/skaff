import { z } from 'zod';
import { TemplateConfig, TemplateConfigModule } from '@timonteutelink/template-types-lib';
import { TemplateSettings as ParentTemplateSettings } from './../../templateConfig';

const templateSettingsSchema = z.object({
	auth: z.boolean().optional(),
});

export type TemplateSettings = z.infer<typeof templateSettingsSchema> & ParentTemplateSettings;
// can be used in sideeffects and path functions to also retrieve options from parents

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

