"use server";

import * as tempLib from "@timonteutelink/code-templator-lib";
import { DefaultTemplateResult, Result, TemplateDTO } from "@timonteutelink/code-templator-lib";

export async function runEraseCache(): Promise<
  Result<DefaultTemplateResult[]>
> {
  return tempLib.eraseCache();
}

export async function reloadTemplates(): Promise<
  Result<DefaultTemplateResult[]>
> {
  return tempLib.reloadTemplates();
}

export async function retrieveDefaultTemplates(): Promise<
  Result<DefaultTemplateResult[]>
> {
  return tempLib.getDefaultTemplates();
}

export async function retrieveDefaultTemplate(
  templateName: string,
): Promise<Result<DefaultTemplateResult | null>> {
  return tempLib.getDefaultTemplate(templateName);
}

export async function retrieveAllTemplateRevisions(
  templateName: string,
): Promise<Result<TemplateDTO[] | null>> {
  return tempLib.getLoadedRevisions(templateName);
}

export async function retrieveTemplateRevisionForProject(
  projectName: string,
): Promise<Result<TemplateDTO | null>> {
  return tempLib.loadProjectTemplateRevision(projectName);
}
