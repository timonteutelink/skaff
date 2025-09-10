import { Result } from "../../lib";
import { Template } from "../../models";
import { getRootTemplateRepository } from "../../repositories";
import { getDefaultTemplates } from "./get-default-templates";

export async function reloadTemplates(): Promise<
  Result<{
    template: Template,
    revisions: string[];
  }[]>
> {
  const rootTemplateRepository = await getRootTemplateRepository();
  const result = await rootTemplateRepository.reloadTemplates();

  if ("error" in result) {
    return { error: result.error };
  }

  return await getDefaultTemplates();
}
