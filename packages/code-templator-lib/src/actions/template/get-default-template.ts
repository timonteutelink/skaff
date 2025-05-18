import { DefaultTemplateResult, Result } from "../../lib";
import { getRootTemplateRepository } from "../../repositories";
import { getCacheDir } from "../../services/cache-service";

export async function getDefaultTemplate(
  templateName: string,
): Promise<Result<DefaultTemplateResult | null>> {
  const rootTemplateRepository = await getRootTemplateRepository();
  const templates =
    await rootTemplateRepository.findAllTemplateRevisions(templateName);
  if ("error" in templates) {
    return { error: templates.error };
  }
  if (!templates.data) {
    return { data: null };
  }

  const cacheDir = await getCacheDir();

  if ("error" in cacheDir) {
    return { error: cacheDir.error };
  }

  const template = templates.data.find((template) => template.isDefault);

  if (!template) {
    return { data: null };
  }

  const templateDto = template.mapToDTO();

  const revisions = templates.data.map(
    (template) => template.findRootTemplate().commitHash!,
  );

  return {
    data: {
      template: templateDto,
      revisions,
    },
  };
}
