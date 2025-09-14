import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
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
import { getApiKey } from "../config/ai-providers";

function createModel(model?: AiModel): any {
  const provider = model?.provider || "openai";
  const name = model?.name || "gpt-4o-mini";
  const apiKey = getApiKey(provider);
  if (!apiKey) return undefined;
  switch (provider) {
    case "anthropic":
      return anthropic(name) as any;
    case "openai":
    default:
      return openai(name) as any;
  }
}

function defaultAutoAgent(model?: AiModel): AiAutoAgent | undefined {
  const m = createModel(model);
  if (!m) return undefined;
  return {
    run: async (prompt: string, context: string[]) => {
      const res = await generateText({
        model: m,
        prompt: `${prompt}\n\n${context.join("\n")}`,
      });
      return res.text;
    },
  };
}

function defaultConversationAgent(
  model?: AiModel,
): AiConversationAgent | undefined {
  const m = createModel(model);
  if (!m) return undefined;
  return {
    run: async (messages: AiMessage[], context: string[]) => {
      const res = await generateText({
        model: m,
        messages: [
          ...messages,
          { role: "system", content: context.join("\n") },
        ],
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

export async function generateAiResults(
  template: Template,
  templateSettings: UserTemplateSettings,
  parentSettings: FinalTemplateSettings | undefined,
  projectRoot: string,
): Promise<Result<AiResultsObject>> {
  const generation: AiGeneration<any> | undefined = template.config.aiGeneration;
  const aiResults: AiResultsObject = {};
  if (!generation?.steps?.length) {
    return { data: aiResults };
  }

  const merged = { ...(parentSettings || {}), ...(templateSettings || {}) } as any;
  const parentCtx = anyOrCallbackToAny(
    template.config.parentContextPaths as AnyOrCallback<any, string[]>,
    { ...merged, aiResults },
  );
  const parentPaths = "error" in parentCtx ? [] : parentCtx.data || [];
  const modelAssignments = (templateSettings as any).aiModels || {};

  async function runAutoStep(step: AiAutoGenerationStep<any>) {
    const model = step.modelKey ? modelAssignments[step.modelKey] : undefined;
    let agent: AiAutoAgent | undefined;
    if (step.modelKey && !model) {
      return { data: undefined };
    }
    if (template.config.buildAutoAgent) {
      agent = await template.config.buildAutoAgent(
        { ...merged, aiResults },
        model,
      );
    } else {
      agent = defaultAutoAgent(model);
    }
    if (!agent) return { data: undefined };

    const ctxRes = anyOrCallbackToAny(
      step.contextPaths as AnyOrCallback<any, string[]>,
      { ...merged, aiResults },
    );
    if ("error" in ctxRes) {
      return ctxRes;
    }
    const context = await loadContext(
      [...parentPaths, ...(ctxRes.data || [])],
      projectRoot,
    );

    if (step.run) {
      const text = await step.run(
        agent,
        { ...merged, aiResults },
        context,
      );
      aiResults[step.resultKey] = text;
      return { data: undefined };
    }

    const promptRes = stringOrCallbackToString(
      step.prompt as StringOrCallback<any>,
      { ...merged, aiResults },
    );
    if ("error" in promptRes) {
      return promptRes;
    }
    const text = await agent.run(promptRes.data, context);
    aiResults[step.resultKey] = text;
    return { data: undefined };
  }

  async function runConversationStep(step: AiConversationGenerationStep<any>) {
    const model = step.modelKey ? modelAssignments[step.modelKey] : undefined;
    let agent: AiConversationAgent | undefined;
    if (step.modelKey && !model) {
      return { data: undefined };
    }
    if (template.config.buildConversationAgent) {
      agent = await template.config.buildConversationAgent(
        { ...merged, aiResults },
        model,
      );
    } else {
      agent = defaultConversationAgent(model);
    }
    if (!agent) return { data: undefined };

    const ctxRes = anyOrCallbackToAny(
      step.contextPaths as AnyOrCallback<any, string[]>,
      { ...merged, aiResults },
    );
    if ("error" in ctxRes) {
      return ctxRes;
    }
    const context = await loadContext(
      [...parentPaths, ...(ctxRes.data || [])],
      projectRoot,
    );
    if (step.run) {
      const text = await step.run(
        agent,
        { ...merged, aiResults },
        context,
      );
      aiResults[step.resultKey] = text;
      return { data: undefined };
    }
    const msgRes = anyOrCallbackToAny(
      step.messages as AnyOrCallback<any, AiMessage[]>,
      { ...merged, aiResults },
    );
    if ("error" in msgRes) {
      return msgRes;
    }
    let conversation = msgRes.data ? [...msgRes.data] : [];
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
    aiResults[step.resultKey] = last?.content || "";
    return { data: undefined };
  }

  const pending = new Map<string, AiGenerationStep<any>>();
  for (const step of generation.steps) {
    pending.set(step.resultKey, step);
  }

  const finished = new Set<string>();

  while (pending.size > 0) {
    const runnable: AiGenerationStep<any>[] = [];
    for (const step of pending.values()) {
      if (!step.dependsOn || step.dependsOn.every((d) => finished.has(d))) {
        runnable.push(step);
      }
    }
    if (!runnable.length) {
      return { error: "Circular ai generation dependencies" };
    }
    await Promise.all(
      runnable.map(async (step) => {
        if (step.type === "auto") {
          await runAutoStep(step);
        } else {
          await runConversationStep(step);
        }
        pending.delete(step.resultKey);
        finished.add(step.resultKey);
      }),
    );
  }

  return { data: aiResults };
}
