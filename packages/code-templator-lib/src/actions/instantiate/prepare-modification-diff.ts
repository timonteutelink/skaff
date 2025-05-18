import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { NewTemplateDiffResult, Result } from "../../lib";
import { getProjectRepository } from "../../repositories";
import { logError } from "../../lib/utils";
import { generateModifyTemplateDiff } from "../../services/project-diff-service";

export async function prepareModificationDiff(
  userTemplateSettings: UserTemplateSettings,
  destinationProjectName: string,
  templateInstanceId: string,
): Promise<Result<NewTemplateDiffResult>> {
  const projectRepository = await getProjectRepository();
  const reloadResult = await projectRepository.reloadProjects();

  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  const project = await projectRepository.findProject(destinationProjectName);

  if ("error" in project) {
    return { error: project.error };
  }

  if (!project.data) {
    logError({ shortMessage: `Project ${destinationProjectName} not found` });
    return { error: `Project ${destinationProjectName} not found` };
  }

  const result = await generateModifyTemplateDiff(
    userTemplateSettings,
    project.data,
    templateInstanceId,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}
