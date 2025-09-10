import { Result } from "../../lib";
import { Template } from "../../models";
import { getRootTemplateRepository } from "../../repositories";

export async function getLoadedRevisions(
  templateName: string,
): Promise<Result<Template[] | null>> {
  const rootTemplateRepository = await getRootTemplateRepository();
  return await rootTemplateRepository.findAllTemplateRevisions(templateName);
}
