import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { NewTemplateDiffResult, Result } from "../../lib";
import { Project } from "../../models";
import { generateNewTemplateDiff } from "../../services/project-diff-service";

export async function prepareInstantiationDiff(
  rootTemplateName: string,
  templateName: string,
  parentInstanceId: string,
  destinationProject: Project,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<NewTemplateDiffResult>> {
  const result = await generateNewTemplateDiff(
    rootTemplateName,
    templateName,
    parentInstanceId,
    destinationProject,
    userTemplateSettings,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}
