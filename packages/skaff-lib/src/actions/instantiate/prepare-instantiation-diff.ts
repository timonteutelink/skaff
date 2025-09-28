import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { NewTemplateDiffResult, Result } from "../../lib";
import { Project } from "../../models";
import { resolveProjectDiffPlanner } from "../../core/diffing/ProjectDiffPlanner";

export async function prepareInstantiationDiff(
  _rootTemplateName: string,
  templateName: string,
  parentInstanceId: string,
  destinationProject: Project,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<NewTemplateDiffResult>> {
  const planner = resolveProjectDiffPlanner();
  const result = await planner.generateNewTemplateDiff(
    templateName,
    parentInstanceId,
    userTemplateSettings,
    destinationProject,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}
