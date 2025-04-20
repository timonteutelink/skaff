"use server";
import { ROOT_TEMPLATE_REGISTRY } from "@repo/ts/services/root-template-registry-service";
import { Result, TemplateDTO } from "@repo/ts/utils/types";

export async function eraseCache(): Promise<Result<TemplateDTO[]>> {
  const eraseResult = await eraseCache();
  if ("error" in eraseResult) {
    console.error("Failed to erase cache:", eraseResult.error);
    return { error: eraseResult.error };
  }

  const reloadResult = await ROOT_TEMPLATE_REGISTRY.reloadTemplates();
  if ("error" in reloadResult) {
    console.error("Failed to reload templates:", reloadResult.error);
    return { error: reloadResult.error };
  }

  const allNewTemplates = await ROOT_TEMPLATE_REGISTRY.getAllTemplates();

  if ("error" in allNewTemplates) {
    console.error("Failed to load templates:", allNewTemplates.error);
    return { error: allNewTemplates.error };
  }

  const templateDtos = allNewTemplates.data.map((template) => template.mapToDTO());

  return { data: templateDtos };
}

export async function reloadTemplates(): Promise<Result<TemplateDTO[]>> {
  const result = await ROOT_TEMPLATE_REGISTRY.reloadTemplates();

  if ("error" in result) {
    console.error("Failed to load templates:", result.error);
    return { error: result.error };
  }

  const allNewTemplates = await ROOT_TEMPLATE_REGISTRY.getAllTemplates();

  if ("error" in allNewTemplates) {
    console.error("Failed to load templates:", allNewTemplates.error);
    return { error: allNewTemplates.error };
  }

  const templateDtos = allNewTemplates.data.map((template) => template.mapToDTO());

  return { data: templateDtos };
}

export async function retrieveTemplates(): Promise<Result<TemplateDTO[]>> {
  const templates = await ROOT_TEMPLATE_REGISTRY.getAllTemplates();

  if ("error" in templates) {
    console.error("Failed to load templates:", templates.error);
    return { error: templates.error };
  }

  const templateDtos = templates.data.map((template) => template.mapToDTO());

  return { data: templateDtos };
}

export async function retrieveDefaultTemplate(
  templateName: string,
): Promise<Result<TemplateDTO | null>> {
  const template = await ROOT_TEMPLATE_REGISTRY.findDefaultTemplate(templateName);

  if ("error" in template) {
    console.error(template.error);
    return { error: template.error };
  }

  if (template.data) {
    return { data: template.data.mapToDTO() };
  }

  return { data: null };
}

/**
 * will return all revisions of the template
 */
export async function retrieveTemplateRevisions(
  templateName: string,
): Promise<Result<TemplateDTO[] | null>> {
  const revisions = await ROOT_TEMPLATE_REGISTRY.findAllTemplateRevisions(templateName);

  if ("error" in revisions) {
    console.error(revisions.error);
    return { error: revisions.error };
  }

  if (!revisions.data) {
    return { data: null };
  }

  const templateDtos = revisions.data.map((template) => template.mapToDTO());

  return { data: templateDtos };
}
