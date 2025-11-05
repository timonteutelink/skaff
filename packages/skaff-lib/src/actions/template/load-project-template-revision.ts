import { Result } from "../../lib";
import { logError } from "../../lib/utils";
import { Project, Template } from "../../models";
import { resolveRootTemplateRepository } from "../../repositories";

export async function loadProjectTemplateRevision(
  project: Project,
): Promise<Result<Template | null>> {
  const rootTemplateRepository = resolveRootTemplateRepository();

  const rootTemplateName = project.instantiatedProjectSettings.rootTemplateName;
  const rootInst = project.instantiatedProjectSettings.instantiatedTemplates[0];
  const commitHash = rootInst?.templateCommitHash;

  if (!commitHash) {
    logError({
      shortMessage: `No commit hash found for project ${project.instantiatedProjectSettings.projectRepositoryName}`,
    });
    return {
      error: `No commit hash found for project ${project.instantiatedProjectSettings.projectRepositoryName}`,
    };
  }

  const repoUrl = rootInst?.templateRepoUrl ?? project.rootTemplate.repoUrl;
  const branch =
    rootInst?.templateBranch ?? project.rootTemplate.branch ?? "main";

  if (repoUrl) {
    const addResult = await rootTemplateRepository.addRemoteRepo(
      repoUrl,
      branch,
    );
    if ("error" in addResult) {
      return addResult;
    }
  }

  return await rootTemplateRepository.loadRevision(
    rootTemplateName,
    commitHash,
  );
}
