import { Result } from "../../lib";
import { Template } from "../../models";
import { getRootTemplateRepository } from "../../repositories";
import { getCacheDir } from "../../services/cache-service";

export async function getDefaultTemplate(
  templateName: string,
): Promise<Result<{
  template: Template,
  revisions: string[];
} | null>> {
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

  const revisions = templates.data.map(
    (template) => template.findRootTemplate().commitHash!,
  );

  return {
    data: {
      template,
      revisions,
    },
  };
}
