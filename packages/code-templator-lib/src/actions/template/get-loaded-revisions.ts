import { Result, TemplateDTO } from "../../lib";
import { getRootTemplateRepository } from "../../repositories";

export async function getLoadedRevisions(
  templateName: string,
): Promise<Result<TemplateDTO[] | null>> {
  const rootTemplateRepository = await getRootTemplateRepository();
  const revisions =
    await rootTemplateRepository.findAllTemplateRevisions(templateName);

  if ("error" in revisions) {
    return { error: revisions.error };
  }

  if (!revisions.data) {
    return { data: null };
  }

  const templateDtos = revisions.data.map((template) => template.mapToDTO());

  return { data: templateDtos };
}
