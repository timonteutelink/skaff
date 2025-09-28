import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { NewTemplateDiffResult, Result } from "../../lib";
import { resolveProjectDiffPlanner } from "../../core/diffing/ProjectDiffPlanner";
import { Project } from "../../models";

export async function prepareModificationDiff(
  userTemplateSettings: UserTemplateSettings,
  destinationProject: Project,
  templateInstanceId: string,
): Promise<Result<NewTemplateDiffResult>> {
  const planner = resolveProjectDiffPlanner();
  const result = await planner.generateModifyTemplateDiff(
    userTemplateSettings,
    destinationProject,
    templateInstanceId,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}
