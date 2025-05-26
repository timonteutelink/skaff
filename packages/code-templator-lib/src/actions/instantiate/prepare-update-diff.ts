import { NewTemplateDiffResult, Result } from "../../lib";
import { Project } from "../../models";
import { generateUpdateTemplateDiff } from "../../services/project-diff-service";

export async function prepareUpdateDiff(
  project: Project,
  newTemplateRevisionCommitHash: string,
): Promise<Result<NewTemplateDiffResult>> {
  const result = await generateUpdateTemplateDiff(
    project,
    newTemplateRevisionCommitHash,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}
