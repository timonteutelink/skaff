import { Result } from "../../lib";
import { Template } from "../../models";
import { getRootTemplateRepository } from "../../repositories";
import { runEraseCache } from "../../core/infra/cache-service";
import { getTemplates } from "./get-templates";

export async function eraseCache(): Promise<Result<{
  template: Template,
  revisions: string[];
}[]>> {
  const rootTemplateRepository = await getRootTemplateRepository();
  const eraseResult = await runEraseCache();
  if ("error" in eraseResult) {
    return { error: eraseResult.error };
  }

  const reloadResult = await rootTemplateRepository.reloadTemplates();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  return await getTemplates();
}
