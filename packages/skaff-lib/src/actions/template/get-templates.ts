import { Result } from "../../lib";
import { Template } from "../../models";
import { getRootTemplateRepository } from "../../repositories";

export async function getTemplates(): Promise<
  Result<{ template: Template; revisions: string[] }[]>
> {
  const rootTemplateRepository = await getRootTemplateRepository();
  const templates = await rootTemplateRepository.getAllTemplates();
  if ("error" in templates) {
    return { error: templates.error };
  }

  const result: { template: Template; revisions: string[] }[] = [];

  for (const template of templates.data) {
    const name = template.config.templateConfig.name;
    const commit = template.findRootTemplate().commitHash!;
    const existing = result.find(
      (t) => t.template.config.templateConfig.name === name,
    );
    if (existing) {
      existing.revisions.push(commit);
      if (template.isLocal) {
        existing.template = template;
      }
    } else {
      result.push({ template, revisions: [commit] });
    }
  }

  return { data: result };
}

