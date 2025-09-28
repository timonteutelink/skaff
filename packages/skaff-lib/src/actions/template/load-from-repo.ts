import { Result } from "../../lib";
import { resolveRootTemplateRepository } from "../../repositories";

export async function loadTemplateFromRepo(
  repoUrl: string,
  branch: string = "main",
): Promise<Result<void>> {
  const rootTemplateRepository = resolveRootTemplateRepository();
  return await rootTemplateRepository.addRemoteRepo(repoUrl, branch);
}
