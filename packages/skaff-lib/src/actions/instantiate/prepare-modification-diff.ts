import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { NewTemplateDiffResult, Result } from "../../lib";
import { generateModifyTemplateDiff } from "../../services/project-diff-service";
import { Project } from "../../models";

export async function prepareModificationDiff(
  userTemplateSettings: UserTemplateSettings,
  destinationProject: Project,
  templateInstanceId: string,
): Promise<Result<NewTemplateDiffResult>> {
  const result = await generateModifyTemplateDiff(
    userTemplateSettings,
    destinationProject,
    templateInstanceId,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}
