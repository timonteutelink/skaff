import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import fs from "fs-extra";
import path from "node:path";
import {
  AiAgent,
  AiGeneration,
  AiMessage,
  AiResultsObject,
  FinalTemplateSettings,
  UserTemplateSettings,
  AnyOrCallback,
  StringOrCallback,
} from "@timonteutelink/template-types-lib";
import { anyOrCallbackToAny, stringOrCallbackToString } from "../lib/utils";
import { Template } from "../models/template";
import { Result } from "../lib/types";

function defaultAgent(): AiAgent {
  const model = openai("gpt-4o-mini");
  return {
    auto: async (prompt: string, context: string[]) => {
      const res = await generateText({
        model,
        prompt: `${prompt}\n\n${context.join("\n")}`,
      });
      return res.text;
    },
    converse: async (messages: AiMessage[], context: string[]) => {
      const res = await generateText({
        model,
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
  if (!generation) {
    return { data: aiResults };
  }

  const merged = { ...(parentSettings || {}), ...(templateSettings || {}) } as any;

  let agent: AiAgent;
  if (template.config.buildAiAgent) {
    agent = await template.config.buildAiAgent(merged);
  } else {
    agent = defaultAgent();
  }

  const parentCtx = anyOrCallbackToAny(
    template.config.parentContextPaths as AnyOrCallback<any, string[]>,
    merged,
  );
  const parentPaths = "error" in parentCtx ? [] : parentCtx.data || [];

  if (generation.auto) {
    const promptRes = stringOrCallbackToString(
      generation.auto.prompt as StringOrCallback<any>,
      merged,
    );
    if ("error" in promptRes) {
      return promptRes;
    }
    const ctxRes = anyOrCallbackToAny(
      generation.auto.contextPaths as AnyOrCallback<any, string[]>,
      merged,
    );
    if ("error" in ctxRes) {
      return ctxRes;
    }
    const context = await loadContext(
      [...parentPaths, ...(ctxRes.data || [])],
      projectRoot,
    );
    const text = await agent.auto(promptRes.data, context);
    aiResults[generation.auto.resultKey] = text;
  }

  if (generation.conversation) {
    const msgRes = anyOrCallbackToAny(
      generation.conversation.messages as AnyOrCallback<any, AiMessage[]>,
      merged,
    );
    if ("error" in msgRes) {
      return msgRes;
    }
    const ctxRes = anyOrCallbackToAny(
      generation.conversation.contextPaths as AnyOrCallback<any, string[]>,
      merged,
    );
    if ("error" in ctxRes) {
      return ctxRes;
    }
    const context = await loadContext(
      [...parentPaths, ...(ctxRes.data || [])],
      projectRoot,
    );
    const text = await agent.converse(msgRes.data || [], context);
    aiResults[generation.conversation.resultKey] = text;
  }

  return { data: aiResults };
}
