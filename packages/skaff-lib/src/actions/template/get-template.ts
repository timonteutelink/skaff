import { Result } from "../../lib";
import { Template } from "../../models";
import { resolveRootTemplateRepository } from "../../repositories";

export async function getTemplate(
  templateName: string,
): Promise<Result<{ template: Template; revisions: string[] } | null>> {
  const rootTemplateRepository = resolveRootTemplateRepository();
  const templates = await rootTemplateRepository.findAllTemplateRevisions(
    templateName,
  );
  if ("error" in templates) {
    return { error: templates.error };
  }
  if (!templates.data || templates.data.length === 0) {
    return { data: null };
  }

  const revisions = templates.data.map((t) =>
    t.findRootTemplate().commitHash!,
  );
  const template = templates.data.find((t) => t.isLocal) || templates.data[0]!;
  return { data: { template, revisions } };
}

