import { Result } from "../../lib";
import { Template } from "../../models";
import { getRootTemplateRepository } from "../../repositories";
import { getCacheDir } from "../../services/cache-service";

export async function getDefaultTemplates(): Promise<
  Result<{
    template: Template,
    revisions: string[];
  }[]>
> {
  const rootTemplateRepository = await getRootTemplateRepository();
  const templates = await rootTemplateRepository.getAllTemplates();

  if ("error" in templates) {
    return { error: templates.error };
  }

  const cacheDir = await getCacheDir();

  if ("error" in cacheDir) {
    return { error: cacheDir.error };
  }

  const result: {
    template: Template;
    revisions: string[];
  }[] =
    templates.data
      .filter((template) => template.isDefault)
      ?.map((template) => ({
        revisions: [template.findRootTemplate().commitHash!],
        template: template,
      })) || [];

  for (const template of templates.data) {
    if (template.isDefault) {
      continue;
    }

    const currentDefaultTemplate = result.find(
      (t) =>
        t.template.config.templateConfig.name ===
        template.config.templateConfig.name,
    );
    if (currentDefaultTemplate) {
      currentDefaultTemplate.revisions.push(
        template.findRootTemplate().commitHash!,
      );
    }
  }

  return { data: result };
}
