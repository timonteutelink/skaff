import { ParsedFile, Result } from "../../lib";
import { Project } from "../../models";
import { applyDiffToProject } from "../../services/project-diff-service";

export async function applyDiff(
  project: Project,
  diffHash: string,
): Promise<Result<ParsedFile[] | { resolveBeforeContinuing: boolean }>> {
  const result = await applyDiffToProject(project, diffHash);

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}
