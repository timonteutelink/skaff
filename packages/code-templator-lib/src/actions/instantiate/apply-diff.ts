import { ParsedFile, Result } from "../../lib";
import { getProjectRepository } from "../../repositories";
import { applyDiffToProject } from "../../services/project-diff-service";

export async function applyDiff(
  projectName: string,
  diffHash: string,
): Promise<Result<ParsedFile[] | { resolveBeforeContinuing: boolean }>> {
  const projectRepository = await getProjectRepository();
  const reloadResult = await projectRepository.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  const result = await applyDiffToProject(projectName, diffHash);

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}
