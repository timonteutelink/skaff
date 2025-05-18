import { DefaultTemplateResult, Result } from "../../lib";
import { getRootTemplateRepository } from "../../repositories";
import { getDefaultTemplates } from "./get-default-templates";

export async function reloadTemplates(): Promise<
  Result<DefaultTemplateResult[]>
> {
  const rootTemplateRepository = await getRootTemplateRepository();
  const result = await rootTemplateRepository.reloadTemplates();

  if ("error" in result) {
    return { error: result.error };
  }

  return await getDefaultTemplates();
}
