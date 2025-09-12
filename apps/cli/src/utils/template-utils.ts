import { getTemplate } from '@timonteutelink/skaff-lib';
import { UserTemplateSettings } from '@timonteutelink/template-types-lib';
import fs from 'node:fs';

import { promptForSchema } from './zod-schema-prompt.js';


async function promptUserTemplateSettings(
  rootTemplateName: string,
  templateName: string,
): Promise<UserTemplateSettings> {
  const rootTpl = await getTemplate(rootTemplateName);
  if ('error' in rootTpl) throw new Error(rootTpl.error);
  if (!rootTpl.data) throw new Error(`No template named "${rootTemplateName}"`);

  const subTpl = rootTpl.data.template.findSubTemplate(templateName);
  if (!subTpl) {
    throw new Error(
      `No sub-template "${templateName}" in root template "${rootTemplateName}"`,
    );
  }

  const result = await promptForSchema(subTpl.config.templateSettingsSchema);
  if (Object.keys(result).length === 0) throw new Error('No settings provided.');

  return result as UserTemplateSettings;
}

export async function readUserTemplateSettings(
  rootTemplateName: string,
  templateName: string,
  arg?: string,
): Promise<UserTemplateSettings> {
  if (!arg) return promptUserTemplateSettings(rootTemplateName, templateName);
  if (fs.existsSync(arg)) return JSON.parse(fs.readFileSync(arg, 'utf8'));
  return JSON.parse(arg);
}

