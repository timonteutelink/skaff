import { Result } from "../../lib";
import { getRootTemplateRepository } from "../../repositories";

export async function loadTemplateFromRepo(
  repoUrl: string,
  branch: string = "main",
): Promise<Result<void>> {
  const rootTemplateRepository = await getRootTemplateRepository();
  return await rootTemplateRepository.addRemoteRepo(repoUrl, branch);
}
