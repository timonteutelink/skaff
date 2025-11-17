import { Result, TemplateRepoLoadResult } from "../../lib";
import { resolveRootTemplateRepository } from "../../repositories";

export async function loadTemplateFromRepo(
  repoUrl: string,
  branch?: string,
  options?: { refresh?: boolean; revision?: string },
): Promise<Result<TemplateRepoLoadResult>> {
  const rootTemplateRepository = resolveRootTemplateRepository();
  return await rootTemplateRepository.addRemoteRepo(repoUrl, branch, {
    refresh: Boolean(options?.refresh),
    revision: options?.revision,
  });
}
