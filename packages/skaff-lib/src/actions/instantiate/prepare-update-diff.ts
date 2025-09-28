import { NewTemplateDiffResult, Result } from "../../lib";
import { resolveProjectDiffPlanner } from "../../core/diffing/ProjectDiffPlanner";
import { Project } from "../../models";

export async function prepareUpdateDiff(
  project: Project,
  newTemplateRevisionCommitHash: string,
): Promise<Result<NewTemplateDiffResult>> {
  const planner = resolveProjectDiffPlanner();
  const result = await planner.generateUpdateTemplateDiff(
    project,
    newTemplateRevisionCommitHash,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}
