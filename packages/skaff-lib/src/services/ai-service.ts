import { generateText } from "ai";
import type { LanguageModel } from "ai";
import { confirm, input } from "@inquirer/prompts";
import fs from "fs-extra";
import path from "node:path";
import {
  AiGeneration,
  AiMessage,
  AiResultsObject,
  FinalTemplateSettings,
  UserTemplateSettings,
  AnyOrCallback,
  StringOrCallback,
  AiModel,
  AiGenerationStep,
  AiAutoGenerationStep,
  AiConversationGenerationStep,
  AiAutoAgent,
  AiConversationAgent,
} from "@timonteutelink/template-types-lib";
import { anyOrCallbackToAny, stringOrCallbackToString } from "../lib/utils";
import { Template } from "../models/template";
import { Result } from "../lib/types";
import { resolveLanguageModel, resolveModelChoice } from "./ai-model-service";
import { withDefaultModelName } from "../lib/ai-model-utils";

function createDefaultAutoAgent(modelClient: LanguageModel): AiAutoAgent {
  return {
    model: modelClient,
    tools: {},
    agents: {},
    llms: [],
    run: async (prompt: string, context: string[]) => {
      const res = await generateText({
        model: modelClient,
        prompt: [prompt, ...context].filter(Boolean).join("\n\n"),
      });
      return res.text;
    },
  };
}

function createDefaultConversationAgent(
  modelClient: LanguageModel,
): AiConversationAgent {
  return {
    model: modelClient,
    tools: {},
    agents: {},
    llms: [],
    run: async (messages: AiMessage[], context: string[]) => {
      const systemMessage =
        context.length > 0
          ? [{ role: "system" as const, content: context.join("\n") }]
          : [];

      const res = await generateText({
        model: modelClient,
        messages: [...messages, ...systemMessage],
      });
      return res.text;
    },
  };
}

async function loadContext(paths: string[] = [], root: string): Promise<string[]> {
  const texts: string[] = [];
  for (const p of paths) {
    try {
      const content = await fs.readFile(path.join(root, p), "utf8");
      texts.push(content);
    } catch {
      // ignore missing files
    }
  }
  return texts;
}

type EvaluationContext = Record<string, any>;

async function gatherContext(
  contextSource: AnyOrCallback<any, string[]> | undefined,
  evaluationContext: EvaluationContext,
  parentPaths: string[],
  projectRoot: string,
): Promise<Result<string[]>> {
  if (!contextSource) {
    const context = await loadContext(parentPaths, projectRoot);
    return { data: context };
  }

  const ctxRes = anyOrCallbackToAny(
    contextSource as AnyOrCallback<any, string[]>,
    evaluationContext,
  );
  if ("error" in ctxRes) {
    return ctxRes;
  }

  const resolvedPaths = [...parentPaths, ...(ctxRes.data || [])];
  const context = await loadContext(resolvedPaths, projectRoot);
  return { data: context };
}

function getCategoryLabel(step: { modelKey?: string }): string {
  return step.modelKey || "default";
}

function resolveConversationMessages(
  step: AiConversationGenerationStep<any>,
  evaluationContext: EvaluationContext,
): Result<AiMessage[]> {
  const msgRes = anyOrCallbackToAny(
    step.messages as AnyOrCallback<any, AiMessage[]>,
    evaluationContext,
  );
  if ("error" in msgRes) {
    return msgRes;
  }

  return { data: msgRes.data ? [...msgRes.data] : [] };
}

async function resolveAutoAgent(
  template: Template,
  step: AiAutoGenerationStep<any>,
  modelAssignments: Record<string, AiModel>,
  evaluationContext: EvaluationContext,
): Promise<Result<{ agent: AiAutoAgent; model?: AiModel }>> {
  let assignedModel = step.modelKey ? modelAssignments[step.modelKey] : undefined;
  if (step.modelKey && !assignedModel) {
    return { error: `Missing AI model assignment for "${step.modelKey}".` };
  }

  if (assignedModel) {
    assignedModel = withDefaultModelName(assignedModel);
  }

  const preferredModel = assignedModel ?? resolveModelChoice(undefined);

  if (template.config.buildAutoAgent) {
    const agent = await template.config.buildAutoAgent(
      evaluationContext,
      preferredModel,
      step,
    );
    return { data: { agent, model: preferredModel } };
  }

  const resolved = resolveLanguageModel(preferredModel);
  if (!resolved) {
    return {
      error: `No connected AI provider available for auto generation step "${step.resultKey}". Please connect an AI provider for the "${getCategoryLabel(step)}" model category.`,
    };
  }

  return {
    data: {
      agent: createDefaultAutoAgent(resolved.client),
      model: resolved.model,
    },
  };
}

async function resolveConversationAgent(
  template: Template,
  step: AiConversationGenerationStep<any>,
  modelAssignments: Record<string, AiModel>,
  evaluationContext: EvaluationContext,
): Promise<Result<{ agent: AiConversationAgent; model?: AiModel }>> {
  let assignedModel = step.modelKey ? modelAssignments[step.modelKey] : undefined;
  if (step.modelKey && !assignedModel) {
    return { error: `Missing AI model assignment for "${step.modelKey}".` };
  }

  if (assignedModel) {
    assignedModel = withDefaultModelName(assignedModel);
  }

  const preferredModel = assignedModel ?? resolveModelChoice(undefined);

  if (template.config.buildConversationAgent) {
    const agent = await template.config.buildConversationAgent(
      evaluationContext,
      preferredModel,
      step,
    );
    return { data: { agent, model: preferredModel } };
  }

  const resolved = resolveLanguageModel(preferredModel);
  if (!resolved) {
    return {
      error: `No connected AI provider available for conversation step "${step.resultKey}". Please connect an AI provider for the "${getCategoryLabel(step)}" model category.`,
    };
  }

  return {
    data: {
      agent: createDefaultConversationAgent(resolved.client),
      model: resolved.model,
    },
  };
}

export interface ConversationStepData {
  resultKey: string;
  modelKey?: string;
  model?: AiModel;
  context: string[];
  messages: AiMessage[];
  categoryDescription?: string;
}

type ConversationHandler = (args: {
  step: AiConversationGenerationStep<any>;
  model: AiModel | undefined;
  context: string[];
  messages: AiMessage[];
  aiResults: AiResultsObject;
  categoryDescription?: string;
}) => Promise<string>;

interface ExecuteOptions {
  template: Template;
  templateSettings: UserTemplateSettings;
  parentSettings: FinalTemplateSettings | undefined;
  projectRoot: string;
  aiResults: AiResultsObject;
  stopOnConversation: boolean;
  onConversationStep?: ConversationHandler;
}

interface ExecuteResult {
  aiResults: AiResultsObject;
  nextConversation?: ConversationStepData;
  completed: boolean;
}

async function executeAutoStep(
  template: Template,
  step: AiAutoGenerationStep<any>,
  modelAssignments: Record<string, AiModel>,
  parentPaths: string[],
  projectRoot: string,
  evaluationContext: EvaluationContext,
): Promise<Result<string>> {
  const agentRes = await resolveAutoAgent(
    template,
    step,
    modelAssignments,
    evaluationContext,
  );
  if ("error" in agentRes) {
    return agentRes;
  }

  const contextRes = await gatherContext(
    step.contextPaths as AnyOrCallback<any, string[]> | undefined,
    evaluationContext,
    parentPaths,
    projectRoot,
  );
  if ("error" in contextRes) {
    return contextRes;
  }

  const agent = agentRes.data.agent;
  const context = contextRes.data;

  if (step.run) {
    const text = await step.run(agent, evaluationContext, context);
    return { data: text };
  }

  const promptRes = stringOrCallbackToString(
    step.prompt as StringOrCallback<any>,
    evaluationContext,
  );
  if ("error" in promptRes) {
    return promptRes;
  }

  const text = await agent.run(promptRes.data, context);
  return { data: text };
}

async function executeConversationStep(
  template: Template,
  step: AiConversationGenerationStep<any>,
  modelAssignments: Record<string, AiModel>,
  parentPaths: string[],
  projectRoot: string,
  evaluationContext: EvaluationContext,
  aiResults: AiResultsObject,
  stopOnConversation: boolean,
  categoryDescription: string | undefined,
  onConversationStep?: ConversationHandler,
): Promise<
  Result<
    | { handled: true; text: string }
    | { handled: false; prompt: ConversationStepData }
  >
> {
  const agentRes = await resolveConversationAgent(
    template,
    step,
    modelAssignments,
    evaluationContext,
  );
  if ("error" in agentRes) {
    return agentRes;
  }

  const contextRes = await gatherContext(
    step.contextPaths as AnyOrCallback<any, string[]> | undefined,
    evaluationContext,
    parentPaths,
    projectRoot,
  );
  if ("error" in contextRes) {
    return contextRes;
  }

  const context = contextRes.data;
  const agent = agentRes.data.agent;
  const model = agentRes.data.model;

  if (step.run) {
    const text = await step.run(agent, evaluationContext, context);
    return { data: { handled: true, text } };
  }

  const messagesRes = resolveConversationMessages(step, evaluationContext);
  if ("error" in messagesRes) {
    return messagesRes;
  }

  const messages = messagesRes.data;

  if (stopOnConversation) {
    return {
      data: {
        handled: false,
        prompt: {
          resultKey: step.resultKey,
          modelKey: step.modelKey,
          model,
          context,
          messages,
          categoryDescription,
        },
      },
    };
  }

  if (onConversationStep) {
    const text = await onConversationStep({
      step,
      model,
      context,
      messages,
      aiResults,
      categoryDescription,
    });
    return { data: { handled: true, text } };
  }

  let conversation = [...messages];
  if (
    conversation.length === 0 ||
    conversation[conversation.length - 1]?.role !== "user"
  ) {
    const userStart = await input({ message: "You:" });
    conversation.push({ role: "user", content: userStart });
  }

  while (true) {
    const reply = await agent.run(conversation, context);
    console.log(reply);
    conversation.push({ role: "assistant", content: reply });
    const cont = await confirm({
      message: "Continue conversation?",
      default: false,
    });
    if (!cont) break;
    const userMsg = await input({ message: "You:" });
    conversation.push({ role: "user", content: userMsg });
  }

  const last = conversation
    .filter((m) => m.role === "assistant")
    .slice(-1)[0];

  return { data: { handled: true, text: last?.content || "" } };
}

function findNextRunnableStep(
  steps: AiGenerationStep<any>[],
  finished: Set<string>,
): AiGenerationStep<any> | undefined {
  for (const step of steps) {
    if (finished.has(step.resultKey)) continue;
    if (!step.dependsOn || step.dependsOn.every((d) => finished.has(d))) {
      return step;
    }
  }
  return undefined;
}

async function executeSteps(options: ExecuteOptions): Promise<Result<ExecuteResult>> {
  const {
    template,
    templateSettings,
    parentSettings,
    projectRoot,
    aiResults,
    stopOnConversation,
    onConversationStep,
  } = options;

  const generation: AiGeneration<any> | undefined = template.config.aiGeneration;
  if (!generation?.steps?.length) {
    return { data: { aiResults, completed: true } };
  }

  const modelAssignments = (templateSettings as any).aiModels || {};
  const categories = (template.config as any).aiModelCategories || {};
  const evaluationBase = {
    ...(parentSettings || {}),
    ...(templateSettings || {}),
  } as any;
  const evaluationContext: EvaluationContext = { ...evaluationBase, aiResults };

  const parentCtx = anyOrCallbackToAny(
    template.config.parentContextPaths as AnyOrCallback<any, string[]>,
    evaluationContext,
  );
  const parentPaths = "error" in parentCtx ? [] : parentCtx.data || [];

  const finished = new Set<string>(Object.keys(aiResults));

  while (finished.size < generation.steps.length) {
    const next = findNextRunnableStep(generation.steps, finished);
    if (!next) {
      return { error: "Circular ai generation dependencies" };
    }

    if (aiResults[next.resultKey] !== undefined) {
      finished.add(next.resultKey);
      continue;
    }

    if (next.type === "auto") {
      const res = await executeAutoStep(
        template,
        next,
        modelAssignments,
        parentPaths,
        projectRoot,
        evaluationContext,
      );
      if ("error" in res) {
        return res;
      }
      aiResults[next.resultKey] = res.data;
      finished.add(next.resultKey);
      continue;
    }

      const convRes = await executeConversationStep(
        template,
        next,
        modelAssignments,
        parentPaths,
        projectRoot,
        evaluationContext,
        aiResults,
        stopOnConversation,
        categories[next.modelKey as string]?.description,
        onConversationStep,
      );

    if ("error" in convRes) {
      return convRes;
    }

    if (!convRes.data.handled) {
      return {
        data: {
          aiResults,
          nextConversation: convRes.data.prompt,
          completed: false,
        },
      };
    }

    aiResults[next.resultKey] = convRes.data.text;
    finished.add(next.resultKey);
  }

  return { data: { aiResults, completed: true } };
}

export interface AdvanceAiGenerationArgs {
  template: Template;
  templateSettings: UserTemplateSettings;
  parentSettings: FinalTemplateSettings | undefined;
  projectRoot: string;
  existingResults?: AiResultsObject;
}

export async function advanceAiGeneration(
  args: AdvanceAiGenerationArgs,
): Promise<Result<ExecuteResult>> {
  const existing =
    (args.existingResults ? { ...args.existingResults } : {}) as AiResultsObject;
  const templateProvidedResults =
    ((args.templateSettings as any).aiResults as AiResultsObject) || {};
  const initialResults: AiResultsObject = {
    ...templateProvidedResults,
    ...existing,
  };

  return await executeSteps({
    template: args.template,
    templateSettings: args.templateSettings,
    parentSettings: args.parentSettings,
    projectRoot: args.projectRoot,
    aiResults: initialResults,
    stopOnConversation: true,
  });
}

export async function generateAiResults(
  template: Template,
  templateSettings: UserTemplateSettings,
  parentSettings: FinalTemplateSettings | undefined,
  projectRoot: string,
): Promise<Result<AiResultsObject>> {
  const templateProvidedResults =
    ((templateSettings as any).aiResults as AiResultsObject) || {};

  const exec = await executeSteps({
    template,
    templateSettings,
    parentSettings,
    projectRoot,
    aiResults: { ...templateProvidedResults },
    stopOnConversation: false,
  });

  if ("error" in exec) {
    return exec;
  }

  return { data: exec.data.aiResults };
}
