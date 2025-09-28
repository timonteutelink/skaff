import { Result } from "../../lib";
import { Template } from "../../models";
import { resolveRootTemplateRepository } from "../../repositories";

export async function listTemplatesInRepo(
  repoUrl: string,
  branch: string = "main",
): Promise<Result<Template[]>> {
  const rootTemplateRepository = resolveRootTemplateRepository();
  return await rootTemplateRepository.listTemplatesInRepo(repoUrl, branch);
}
