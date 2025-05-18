import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { NewTemplateDiffResult, Result } from "../../lib";
import { logError } from "../../lib/utils";
import { getProjectRepository } from "../../repositories";
import { generateNewTemplateDiff } from "../../services/project-diff-service";

export async function prepareInstantiationDiff(
  rootTemplateName: string,
  templateName: string,
  parentInstanceId: string,
  destinationProjectName: string,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<NewTemplateDiffResult>> {
  const projectRepository = await getProjectRepository();
  const reloadResult = await projectRepository.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  const destinationProject = await projectRepository.findProject(
    destinationProjectName,
  );

  if ("error" in destinationProject) {
    return { error: destinationProject.error };
  }

  if (!destinationProject.data) {
    logError({
      shortMessage: `Destination project ${destinationProjectName} not found`,
    });
    return { error: `Destination project ${destinationProjectName} not found` };
  }

  const result = await generateNewTemplateDiff(
    rootTemplateName,
    templateName,
    parentInstanceId,
    destinationProject.data,
    userTemplateSettings,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}
