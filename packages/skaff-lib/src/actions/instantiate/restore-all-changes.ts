import { Result } from "../../lib";
import { Project } from "../../models";
import { resetAllChanges } from "../../core/infra/git-service";

export async function restoreAllChanges(
  project: Project
): Promise<Result<void>> {
  const restoreResult = await resetAllChanges(project.absoluteRootDir);

  if ("error" in restoreResult) {
    return { error: restoreResult.error };
  }

  return { data: undefined };
}
