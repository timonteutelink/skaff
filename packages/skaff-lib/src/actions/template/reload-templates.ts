import { Result } from "../../lib";
import { Template } from "../../models";
import { resolveRootTemplateRepository } from "../../repositories";
import { getTemplates } from "./get-templates";

export async function reloadTemplates(): Promise<
  Result<{
    template: Template,
    revisions: string[];
  }[]>
> {
  const rootTemplateRepository = resolveRootTemplateRepository();
  const result = await rootTemplateRepository.reloadTemplates();

  if ("error" in result) {
    return { error: result.error };
  }

  return await getTemplates();
}
