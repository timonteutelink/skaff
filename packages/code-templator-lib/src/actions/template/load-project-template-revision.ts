import { Result, TemplateDTO } from "../../lib";
import { logError } from "../../lib/utils";
import {
  getProjectRepository,
  getRootTemplateRepository,
} from "../../repositories";

export async function loadProjectTemplateRevision(
  projectName: string,
): Promise<Result<TemplateDTO | null>> {
  const projectRepository = await getProjectRepository();
  const rootTemplateRepository = await getRootTemplateRepository();
  const reloadResult = await projectRepository.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }
  const project = await projectRepository.findProject(projectName);
  if ("error" in project) {
    return { error: project.error };
  }
  if (!project.data) {
    return { data: null };
  }

  const rootTemplateName =
    project.data.instantiatedProjectSettings.rootTemplateName;
  const commitHash =
    project.data.instantiatedProjectSettings.instantiatedTemplates[0]
      ?.templateCommitHash;

  if (!commitHash) {
    logError({
      shortMessage: `No commit hash found for project ${projectName}`,
    });
    return { error: `No commit hash found for project ${projectName}` };
  }

  const revision = await rootTemplateRepository.loadRevision(
    rootTemplateName,
    commitHash,
  );

  if ("error" in revision) {
    return { error: revision.error };
  }
  if (!revision.data) {
    return { data: null };
  }
  const templateDto = revision.data.mapToDTO();

  return { data: templateDto };
}
