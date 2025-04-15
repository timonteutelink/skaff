'use server';
import { ROOT_TEMPLATE_REGISTRY } from "@repo/ts/services/root-template-registry-service";
import { TemplateDTO } from "@repo/ts/utils/types";

export async function retrieveTemplates(): Promise<TemplateDTO[]> {
  const templates = await ROOT_TEMPLATE_REGISTRY.getTemplates();

  const templateDtos = templates.map((template) =>
    template.mapToDTO(),
  );

  return templateDtos;
}

export async function retrieveTemplate(
  templateName: string,
): Promise<TemplateDTO | null> {
  const template = await ROOT_TEMPLATE_REGISTRY.findTemplate(templateName);

  if ("error" in template) {
    console.error(template.error);
    return null;
  }

  return template.data.mapToDTO();
}
