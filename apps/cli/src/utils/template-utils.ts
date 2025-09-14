import {
  advanceAiGeneration,
  getConnectedProviders,
  getTemplate,
  getDefaultModelName,
  resolveLanguageModel,
  type ConversationStepData,
  type Template,
} from '@timonteutelink/skaff-lib';
import {
  AiModel,
  AiResultsObject,
  UserTemplateSettings,
} from '@timonteutelink/template-types-lib';
import { confirm, input, select } from '@inquirer/prompts';
import { streamText } from 'ai';
import fs from 'node:fs';

import { promptForSchema } from './zod-schema-prompt.js';

async function runCliConversation(
  prompt: ConversationStepData,
  connectedProviders: string[],
): Promise<string> {
  console.log(`\n💬 Starting conversation for "${prompt.resultKey}"`);
  if (prompt.categoryDescription) {
    console.log(`ℹ️  ${prompt.categoryDescription}`);
  }

  const resolved = resolveLanguageModel(prompt.model, connectedProviders);
  if (!resolved) {
    throw new Error(
      'No AI providers connected. Please configure an AI API key before continuing.',
    );
  }

  const { client: modelClient, model } = resolved;
  if (!prompt.model) {
    console.log(
      `🧠 Using ${model.provider} model ${model.name} for this conversation.`,
    );
  }
  let conversation = [...prompt.messages];
  const systemContext = prompt.context
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .join('\n');
  const systemMessages =
    systemContext.length > 0
      ? [{ role: 'system' as const, content: systemContext }]
      : [];

  if (
    conversation.length === 0 ||
    conversation[conversation.length - 1]?.role !== 'user'
  ) {
    const userStart = await input({ message: 'You:' });
    conversation.push({ role: 'user', content: userStart });
  }

  while (true) {
    const response = await streamText({
      model: modelClient,
      messages: [...systemMessages, ...conversation],
    });

    let reply = '';
    process.stdout.write('\nAssistant: ');
    for await (const delta of response.textStream) {
      process.stdout.write(delta);
      reply += delta;
    }
    process.stdout.write('\n');

    conversation.push({ role: 'assistant', content: reply.trim() });

    const cont = await confirm({
      message: 'Continue conversation?',
      default: false,
    });
    if (!cont) {
      break;
    }
    const userMsg = await input({ message: 'You:' });
    conversation.push({ role: 'user', content: userMsg });
  }

  const last = conversation
    .filter((m) => m.role === 'assistant')
    .slice(-1)[0];

  return last?.content || '';
}

function assertAiAvailability(
  hasAiGeneration: boolean,
  connectedProviders: string[],
): void {
  if (hasAiGeneration && connectedProviders.length === 0) {
    throw new Error(
      'No AI providers configured. Please set an API key (e.g. OPENAI_API_KEY) before instantiating this template.',
    );
  }
}

async function selectModelsForCategories(
  categories: Record<string, { description?: string }>,
  connectedProviders: string[],
): Promise<Record<string, AiModel>> {
  const entries = Object.entries(categories);

  if (entries.length === 0) {
    return {};
  }

  if (connectedProviders.length === 0) {
    throw new Error(
      'No AI providers configured. Please set an API key (e.g. OPENAI_API_KEY) before instantiating this template.',
    );
  }

  const aiModels: Record<string, AiModel> = {};

  for (const [key, category] of entries) {
    console.log(`\n🧠 Configure model for category "${key}"`);
    if (category?.description) {
      console.log(`ℹ️  ${category.description}`);
    }

    const provider = await select({
      message: `LLM provider for "${key}":`,
      choices: connectedProviders.map((p) => ({ name: p, value: p })),
    });

    const defaultName = getDefaultModelName(provider);
    const name = await input({
      message: `Model name for "${key}" (default ${defaultName}):`,
      default: defaultName,
    });

    aiModels[key] = { provider, name };
  }

  return aiModels;
}

interface ConversationLoopOptions {
  template: Template;
  templateSettings: UserTemplateSettings;
  connectedProviders: string[];
  existingResults: AiResultsObject;
  hasAiGeneration: boolean;
}

async function collectAiConversationResults({
  template,
  templateSettings,
  connectedProviders,
  existingResults,
  hasAiGeneration,
}: ConversationLoopOptions): Promise<AiResultsObject> {
  if (!hasAiGeneration) {
    return existingResults;
  }

  let aiResults = existingResults;

  while (true) {
    const progress = await advanceAiGeneration({
      template,
      templateSettings,
      parentSettings: undefined,
      projectRoot: process.cwd(),
      existingResults: aiResults,
    });

    if ('error' in progress) {
      throw new Error(progress.error);
    }

    aiResults = progress.data.aiResults;

    if (!progress.data.nextConversation) {
      return aiResults;
    }

    const reply = await runCliConversation(
      progress.data.nextConversation,
      connectedProviders,
    );

    aiResults = {
      ...aiResults,
      [progress.data.nextConversation.resultKey]: reply,
    };
  }
}

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

  const categories = (subTpl.config as any).aiModelCategories || {};
  const connectedProviders = getConnectedProviders();
  const hasAiGeneration = Array.isArray(subTpl.config.aiGeneration?.steps)
    ? subTpl.config.aiGeneration!.steps.length > 0
    : false;

  assertAiAvailability(hasAiGeneration, connectedProviders);

  const aiModels = await selectModelsForCategories(
    categories,
    connectedProviders,
  );

  if (Object.keys(aiModels).length > 0) {
    (result as any).aiModels = aiModels;
  }

  const existingResults = ((result as any).aiResults ?? {}) as AiResultsObject;

  const aiResults = await collectAiConversationResults({
    template: subTpl,
    templateSettings: result as UserTemplateSettings,
    connectedProviders,
    existingResults,
    hasAiGeneration,
  });

  if (Object.keys(aiResults).length > 0) {
    (result as any).aiResults = aiResults;
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
