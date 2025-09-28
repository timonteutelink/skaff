import { Result } from "../../lib";
import { Template } from "../../models";
import { resolveRootTemplateRepository } from "../../repositories";

export async function getLoadedRevisions(
  templateName: string,
): Promise<Result<Template[] | null>> {
  const rootTemplateRepository = resolveRootTemplateRepository();
  return await rootTemplateRepository.findAllTemplateRevisions(templateName);
}
