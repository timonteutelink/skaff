import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
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

function createModel(model?: AiModel) {
  const provider = model?.provider || "openai";
  const name = model?.name || "gpt-4o-mini";
  const apiKey = getApiKey(provider);
  switch (provider) {
    case "anthropic":
      return anthropic(name, { apiKey });
    case "openai":
    default:
      return openai(name, { apiKey });
  }
}

function defaultAutoAgent(model?: AiModel): AiAutoAgent {
  const m = createModel(model);
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

function defaultConversationAgent(model?: AiModel): AiConversationAgent {
  const m = createModel(model);
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
    merged,
  );
  const parentPaths = "error" in parentCtx ? [] : parentCtx.data || [];
  const modelAssignments = (templateSettings as any).aiModels || {};

  async function runAutoStep(step: AiAutoGenerationStep<any>) {
    const model = step.modelKey ? modelAssignments[step.modelKey] : undefined;
    let agent: AiAutoAgent;
    if (template.config.buildAutoAgent) {
      agent = await template.config.buildAutoAgent(merged, model);
    } else {
      agent = defaultAutoAgent(model);
    }

    const ctxRes = anyOrCallbackToAny(
      step.contextPaths as AnyOrCallback<any, string[]>,
      merged,
    );
    if ("error" in ctxRes) {
      return ctxRes;
    }
    const context = await loadContext(
      [...parentPaths, ...(ctxRes.data || [])],
      projectRoot,
    );

    if (step.run) {
      const text = await step.run(agent, merged, context);
      aiResults[step.resultKey] = text;
      return { data: undefined };
    }

    const promptRes = stringOrCallbackToString(
      step.prompt as StringOrCallback<any>,
      merged,
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
    let agent: AiConversationAgent;
    if (template.config.buildConversationAgent) {
      agent = await template.config.buildConversationAgent(merged, model);
    } else {
      agent = defaultConversationAgent(model);
    }

    const ctxRes = anyOrCallbackToAny(
      step.contextPaths as AnyOrCallback<any, string[]>,
      merged,
    );
    if ("error" in ctxRes) {
      return ctxRes;
    }
    const context = await loadContext(
      [...parentPaths, ...(ctxRes.data || [])],
      projectRoot,
    );
    const msgRes = anyOrCallbackToAny(
      step.messages as AnyOrCallback<any, AiMessage[]>,
      merged,
    );
    if ("error" in msgRes) {
      return msgRes;
    }
    const text = await agent.run(msgRes.data || [], context);
    aiResults[step.resultKey] = text;
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
