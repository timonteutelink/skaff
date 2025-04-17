'use server';
import { ROOT_TEMPLATE_REGISTRY } from "@repo/ts/services/root-template-registry-service";
import { Result, TemplateDTO } from "@repo/ts/utils/types";

export async function retrieveTemplates(): Promise<Result<TemplateDTO[]>> {
  const templates = await ROOT_TEMPLATE_REGISTRY.getTemplates();

  if ("error" in templates) {
    console.error("Failed to load templates:", templates.error);
    return { error: templates.error };
  }

  const templateDtos = templates.data.map((template) =>
    template.mapToDTO(),
  );

  return { data: templateDtos };
}

export async function retrieveTemplate(
  templateName: string,
): Promise<Result<TemplateDTO | null>> {
  const template = await ROOT_TEMPLATE_REGISTRY.findTemplate(templateName);

  if ("error" in template) {
    console.error(template.error);
    return { error: template.error };
  }

  if (template.data) {
    return { data: template.data.mapToDTO() };
  }

  return { data: null };
}
