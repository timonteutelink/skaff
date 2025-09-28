import { ParsedFile, Result } from "../../lib";
import { resolveProjectDiffPlanner } from "../../core/diffing/ProjectDiffPlanner";
import { Project } from "../../models";

export async function applyDiff(
  project: Project,
  diffHash: string,
): Promise<Result<ParsedFile[] | { resolveBeforeContinuing: boolean }>> {
  const planner = resolveProjectDiffPlanner();
  const result = await planner.applyDiffToProject(project, diffHash);

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}
