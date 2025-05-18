import { NewTemplateDiffResult, Result } from "../../lib";
import { logError } from "../../lib/utils";
import { getProjectRepository } from "../../repositories";
import { generateUpdateTemplateDiff } from "../../services/project-diff-service";

export async function prepareUpdateDiff(
  projectName: string,
  newTemplateRevisionCommitHash: string,
): Promise<Result<NewTemplateDiffResult>> {
  const projectRepository = await getProjectRepository();
  const reloadResult = await projectRepository.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  const project = await projectRepository.findProject(projectName);

  if ("error" in project) {
    return { error: project.error };
  }

  if (!project.data) {
    logError({ shortMessage: `Project ${projectName} not found` });
    return { error: `Project ${projectName} not found` };
  }

  const result = await generateUpdateTemplateDiff(
    project.data,
    newTemplateRevisionCommitHash,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}
