import { Result } from "../../lib";
import { logError } from "../../lib/utils";
import { Project, Template } from "../../models";
import {
  getRootTemplateRepository
} from "../../repositories";

export async function loadProjectTemplateRevision(
  project: Project,
): Promise<Result<Template | null>> {
  const rootTemplateRepository = await getRootTemplateRepository();

  const rootTemplateName =
    project.instantiatedProjectSettings.rootTemplateName;
  const commitHash =
    project.instantiatedProjectSettings.instantiatedTemplates[0]
      ?.templateCommitHash;

  if (!commitHash) {
    logError({
      shortMessage: `No commit hash found for project ${project.instantiatedProjectSettings.projectName}`,
    });
    return { error: `No commit hash found for project ${project.instantiatedProjectSettings.projectName}` };
  }

  return await rootTemplateRepository.loadRevision(
    rootTemplateName,
    commitHash,
  );
}
