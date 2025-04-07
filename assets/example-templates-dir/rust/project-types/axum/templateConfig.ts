import { z } from 'zod';
import { TemplateConfig, TemplateConfigModule } from '@timonteutelink/template-types-lib';
import { TemplateSettings as ParentTemplateSettings } from './../../templateConfig';

const templateSettingsSchema = z.object({
	auth: z.boolean().optional(),
});

export type TemplateSettings = z.infer<typeof templateSettingsSchema> & ParentTemplateSettings;

const templateConfig: TemplateConfig = {
	name: 'axum',
	description: 'Axum template',
	author: "Timon Teutelink"
};

const templateConfigModule: TemplateConfigModule<TemplateSettings> = {
	templateConfig,
	targetPath: 'src',
	templateSettingsSchema,
	sideEffects: [
	]
};

export default templateConfigModule;

