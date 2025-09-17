"use server";

import {
  advanceAiGeneration,
  getConnectedProviders,
  getTemplate,
  getConfig,
  projectSearchPathKey,
  type ConversationStepData,
  type Result,
} from "@timonteutelink/skaff-lib";
import {
  AiResultsObject,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";

export async function getConnectedAiProviders(): Promise<string[]> {
  return getConnectedProviders();
}

export interface AdvanceConversationArgs {
  rootTemplateName: string;
  templateName: string;
  templateSettings: UserTemplateSettings;
  aiResults?: AiResultsObject;
  projectRoot?: string;
  projectDirPathId?: string;
}

export async function advanceTemplateAiGeneration(
  args: AdvanceConversationArgs,
): Promise<
  Result<{
    aiResults: AiResultsObject;
    nextConversation?: ConversationStepData;
    completed: boolean;
  }>
> {
  const templateRes = await getTemplate(args.rootTemplateName);
  if ("error" in templateRes) {
    return { error: templateRes.error };
  }
  if (!templateRes.data) {
    return { error: `Template ${args.rootTemplateName} not found` };
  }

  const subTemplate = templateRes.data.template.findSubTemplate(
    args.templateName,
  );
  if (!subTemplate) {
    return {
      error: `Sub-template ${args.templateName} not found in template ${args.rootTemplateName}`,
    };
  }

  let projectRoot = args.projectRoot ?? process.cwd();

  if (args.projectDirPathId) {
    const config = await getConfig();
    const resolved = config.PROJECT_SEARCH_PATHS.find(
      (dir) => projectSearchPathKey(dir) === args.projectDirPathId,
    );
    if (!resolved) {
      return { error: `Invalid project directory path ID: ${args.projectDirPathId}` };
    }
    projectRoot = resolved;
  }

  const exec = await advanceAiGeneration({
    template: subTemplate,
    templateSettings: args.templateSettings,
    parentSettings: undefined,
    projectRoot,
    existingResults: args.aiResults,
  });

  if ("error" in exec) {
    return { error: exec.error };
  }

  return { data: exec.data };
}
