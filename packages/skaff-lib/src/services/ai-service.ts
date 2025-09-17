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
  AiModelCategory,
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

type EvaluationContext = FinalTemplateSettings & { aiResults: AiResultsObject };
type ModelAssignments = Record<string, AiModel>;
type CategoryMap = Record<string, AiModelCategory | undefined>;
type ContextSource = AnyOrCallback<EvaluationContext, string[]> | undefined;

interface GenerationState {
  aiResults: AiResultsObject;
  evaluationContext: EvaluationContext;
  finishedSteps: Set<string>;
}

async function resolveStepContext(
  contextSource: ContextSource,
  evaluationContext: EvaluationContext,
  parentPaths: string[],
  projectRoot: string,
): Promise<Result<string[]>> {
  if (!contextSource) {
    const context = await loadContext(parentPaths, projectRoot);
    return { data: context };
  }

  const ctxRes = anyOrCallbackToAny(contextSource, evaluationContext);
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

function getCategoryDescription(
  modelKey: string | undefined,
  categories: CategoryMap,
): string | undefined {
  return modelKey ? categories[modelKey]?.description : undefined;
}

function createEvaluationContext(
  templateSettings: UserTemplateSettings,
  parentSettings: FinalTemplateSettings | undefined,
  aiResults: AiResultsObject,
): EvaluationContext {
  return {
    ...(parentSettings || {}),
    ...(templateSettings || {}),
    aiResults,
  } as EvaluationContext;
}

function resolvePreferredModel(
  step: { modelKey?: string },
  modelAssignments: ModelAssignments,
): Result<AiModel | undefined> {
  let assignedModel = step.modelKey ? modelAssignments[step.modelKey] : undefined;
  if (step.modelKey && !assignedModel) {
    return { error: `Missing AI model assignment for "${step.modelKey}".` };
  }

  if (assignedModel) {
    assignedModel = withDefaultModelName(assignedModel);
  }

  return { data: assignedModel ?? resolveModelChoice(undefined) };
}

function missingProviderError(
  step: { resultKey: string; modelKey?: string },
  kind: "auto" | "conversation",
): string {
  const category = getCategoryLabel(step);
  const stepLabel = kind === "auto" ? "auto generation" : "conversation";
  return `No connected AI provider available for ${stepLabel} step "${step.resultKey}". Please connect an AI provider for the "${category}" model category.`;
}

function resolveConversationMessages(
  step: AiConversationGenerationStep<any>,
  evaluationContext: EvaluationContext,
): Result<AiMessage[]> {
  const msgRes = anyOrCallbackToAny(
    step.messages as AnyOrCallback<EvaluationContext, AiMessage[]>,
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
  modelAssignments: ModelAssignments,
  evaluationContext: EvaluationContext,
): Promise<Result<{ agent: AiAutoAgent; model?: AiModel }>> {
  const modelRes = resolvePreferredModel(step, modelAssignments);
  if ("error" in modelRes) {
    return modelRes;
  }

  const preferredModel = modelRes.data;

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
    return { error: missingProviderError(step, "auto") };
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
  modelAssignments: ModelAssignments,
  evaluationContext: EvaluationContext,
): Promise<Result<{ agent: AiConversationAgent; model?: AiModel }>> {
  const modelRes = resolvePreferredModel(step, modelAssignments);
  if ("error" in modelRes) {
    return modelRes;
  }

  const preferredModel = modelRes.data;

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
    return { error: missingProviderError(step, "conversation") };
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

function buildConversationPrompt(
  step: AiConversationGenerationStep<any>,
  model: AiModel | undefined,
  context: string[],
  messages: AiMessage[],
  categoryDescription?: string,
): ConversationStepData {
  return {
    resultKey: step.resultKey,
    modelKey: step.modelKey,
    model,
    context,
    messages,
    categoryDescription,
  };
}

async function runInteractiveConversation(
  agent: AiConversationAgent,
  context: string[],
  initialMessages: AiMessage[],
): Promise<string> {
  const conversation = [...initialMessages];

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

  const lastAssistant = conversation
    .filter((message) => message.role === "assistant")
    .slice(-1)[0];

  return lastAssistant?.content || "";
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

interface ProcessGenerationStepArgs {
  template: Template;
  step: AiGenerationStep<any>;
  modelAssignments: ModelAssignments;
  parentPaths: string[];
  projectRoot: string;
  evaluationContext: EvaluationContext;
  aiResults: AiResultsObject;
  stopOnConversation: boolean;
  categoryDescription?: string;
  onConversationStep?: ConversationHandler;
}

type StepOutcome =
  | { status: "complete"; value: string }
  | { status: "awaiting-conversation"; prompt: ConversationStepData };

async function processGenerationStep(
  args: ProcessGenerationStepArgs,
): Promise<Result<StepOutcome>> {
  const {
    template,
    step,
    modelAssignments,
    parentPaths,
    projectRoot,
    evaluationContext,
    aiResults,
    stopOnConversation,
    categoryDescription,
    onConversationStep,
  } = args;

  if (step.type === "auto") {
    const autoStep = step as AiAutoGenerationStep<any>;
    const res = await executeAutoStep(
      template,
      autoStep,
      modelAssignments,
      parentPaths,
      projectRoot,
      evaluationContext,
    );

    if ("error" in res) {
      return res;
    }

    return { data: { status: "complete", value: res.data } };
  }

  const conversationStep = step as AiConversationGenerationStep<any>;
  const convRes = await executeConversationStep(
    template,
    conversationStep,
    modelAssignments,
    parentPaths,
    projectRoot,
    evaluationContext,
    aiResults,
    stopOnConversation,
    categoryDescription,
    onConversationStep,
  );

  if ("error" in convRes) {
    return convRes;
  }

  if (!convRes.data.handled) {
    return {
      data: {
        status: "awaiting-conversation",
        prompt: convRes.data.prompt,
      },
    };
  }

  return { data: { status: "complete", value: convRes.data.text } };
}

async function executeAutoStep(
  template: Template,
  step: AiAutoGenerationStep<any>,
  modelAssignments: ModelAssignments,
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

  const contextRes = await resolveStepContext(
    step.contextPaths as ContextSource,
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
    step.prompt as StringOrCallback<EvaluationContext>,
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
  modelAssignments: ModelAssignments,
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

  const contextRes = await resolveStepContext(
    step.contextPaths as ContextSource,
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
        prompt: buildConversationPrompt(
          step,
          model,
          context,
          messages,
          categoryDescription,
        ),
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

  const text = await runInteractiveConversation(agent, context, messages);

  return { data: { handled: true, text } };
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

  const modelAssignments: ModelAssignments = (
    (templateSettings as any).aiModels || {}
  ) as ModelAssignments;
  const categories: CategoryMap = template.config.aiModelCategories ?? {};
  const evaluationContext = createEvaluationContext(
    templateSettings,
    parentSettings,
    aiResults,
  );

  const parentContextSource =
    template.config.parentContextPaths as
      | AnyOrCallback<EvaluationContext, string[]>
      | undefined;
  const parentPaths = parentContextSource
    ? (() => {
        const res = anyOrCallbackToAny(parentContextSource, evaluationContext);
        return "error" in res ? [] : res.data || [];
      })()
    : [];

  const state: GenerationState = {
    aiResults,
    evaluationContext,
    finishedSteps: new Set<string>(Object.keys(aiResults)),
  };

  while (state.finishedSteps.size < generation.steps.length) {
    const next = findNextRunnableStep(generation.steps, state.finishedSteps);
    if (!next) {
      return { error: "Circular ai generation dependencies" };
    }

    if (state.aiResults[next.resultKey] !== undefined) {
      state.finishedSteps.add(next.resultKey);
      continue;
    }

    const outcome = await processGenerationStep({
      template,
      step: next,
      modelAssignments,
      parentPaths,
      projectRoot,
      evaluationContext: state.evaluationContext,
      aiResults: state.aiResults,
      stopOnConversation,
      categoryDescription: getCategoryDescription(next.modelKey, categories),
      onConversationStep,
    });

    if ("error" in outcome) {
      return outcome;
    }

    if (outcome.data.status === "awaiting-conversation") {
      return {
        data: {
          aiResults: state.aiResults,
          nextConversation: outcome.data.prompt,
          completed: false,
        },
      };
    }

    state.aiResults[next.resultKey] = outcome.data.value;
    state.finishedSteps.add(next.resultKey);
  }

  return { data: { aiResults: state.aiResults, completed: true } };
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
