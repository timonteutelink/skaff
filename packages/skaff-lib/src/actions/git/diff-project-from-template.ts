import { ParsedFile, Result } from "../../lib";
import { Project } from "../../models";
import { resolveProjectDiffPlanner } from "../../core/diffing/ProjectDiffPlanner";

export async function diffProjectFromTemplate(
  project: Project
): Promise<Result<{ files: ParsedFile[], hash: string }>> {
  const planner = resolveProjectDiffPlanner();
  return planner.diffProjectFromTemplate(project);
}
