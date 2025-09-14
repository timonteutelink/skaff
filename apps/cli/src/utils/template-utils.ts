import { getTemplate } from '@timonteutelink/skaff-lib';
import { UserTemplateSettings } from '@timonteutelink/template-types-lib';
import { confirm, input, select } from '@inquirer/prompts';
import fs from 'node:fs';

import { promptForSchema } from './zod-schema-prompt.js';


async function promptUserTemplateSettings(
  rootTemplateName: string,
  templateName: string,
  defaults?: UserTemplateSettings,
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

  const result = await promptForSchema(subTpl.config.templateSettingsSchema, {
    defaults,
  });
  if (Object.keys(result).length === 0) throw new Error('No settings provided.');

  const providerOptions = ['openai', 'anthropic'];
  const categories = (subTpl.config as any).aiModelCategories || {};
  const aiModels: Record<string, { provider: string; name: string }> = {};
  for (const [key, cat] of Object.entries(categories)) {
    const useModel = await confirm({
      message: `Configure model for "${key}"? (${(cat as any).description})`,
      default: false,
    });
    if (!useModel) continue;
    const provider = await select({
      message: `LLM provider for "${key}":`,
      choices: providerOptions.map((p) => ({ name: p, value: p })),
    });
    const name = await input({
      message: `Model name for "${key}":`,
    });
    aiModels[key] = { provider, name };
  }
  if (Object.keys(aiModels).length) {
    (result as any).aiModels = aiModels;
  }

  return result as UserTemplateSettings;
}

export async function readUserTemplateSettings(
  rootTemplateName: string,
  templateName: string,
  arg?: string,
  defaults?: UserTemplateSettings,
): Promise<UserTemplateSettings> {
  if (!arg) return promptUserTemplateSettings(rootTemplateName, templateName, defaults);
  if (fs.existsSync(arg)) return JSON.parse(fs.readFileSync(arg, 'utf8'));
  return JSON.parse(arg);
}

