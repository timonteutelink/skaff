"use server";
import { getCacheDir } from "@repo/ts/services/cache-service";
import { PROJECT_REGISTRY } from "@repo/ts/services/project-registry-service";
import { ROOT_TEMPLATE_REGISTRY } from "@repo/ts/services/root-template-registry-service";
import { DefaultTemplateResult, Result, TemplateDTO } from "@repo/ts/utils/types";

export async function eraseCache(): Promise<Result<DefaultTemplateResult[]>> {
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

  const allNewTemplates = await retrieveDefaultTemplates();

  if ("error" in allNewTemplates) {
    console.error("Failed to load templates:", allNewTemplates.error);
    return { error: allNewTemplates.error };
  }

  return { data: allNewTemplates.data };
}

export async function reloadTemplates(): Promise<Result<DefaultTemplateResult[]>> {
  const result = await ROOT_TEMPLATE_REGISTRY.reloadTemplates();

  if ("error" in result) {
    console.error("Failed to load templates:", result.error);
    return { error: result.error };
  }

  const allNewTemplates = await retrieveDefaultTemplates();

  if ("error" in allNewTemplates) {
    console.error("Failed to load templates:", allNewTemplates.error);
    return { error: allNewTemplates.error };
  }

  return { data: allNewTemplates.data };
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

export async function retrieveDefaultTemplates(): Promise<Result<DefaultTemplateResult[]>> {
  const templates = await ROOT_TEMPLATE_REGISTRY.getAllTemplates();

  if ("error" in templates) {
    console.error("Failed to load templates:", templates.error);
    return { error: templates.error };
  }

  const cacheDir = await getCacheDir();

  if ("error" in cacheDir) {
    console.error("Failed to get cache directory:", cacheDir.error);
    return { error: cacheDir.error };
  }

  const result: DefaultTemplateResult[] = templates.data.filter((template) => template.isDefault)?.map((template) => ({
    revisions: [template.findRootTemplate().commitHash!],
    template: template.mapToDTO(),
  })) || [];

  for (const template of templates.data) {
    if (template.isDefault) {
      continue;
    }

    const currentDefaultTemplate = result.find((t) => t.template.config.templateConfig.name === template.config.templateConfig.name);
    if (currentDefaultTemplate) {
      currentDefaultTemplate.revisions.push(template.findRootTemplate().commitHash!);
    }
  }

  return { data: result };
}

export async function retrieveDefaultTemplate(
  templateName: string,
): Promise<Result<DefaultTemplateResult | null>> {
  const templates = await ROOT_TEMPLATE_REGISTRY.findAllTemplateRevisions(templateName);
  if ("error" in templates) {
    console.error(templates.error);
    return { error: templates.error };
  }
  if (!templates.data) {
    return { data: null };
  }

  const cacheDir = await getCacheDir();

  if ("error" in cacheDir) {
    console.error("Failed to get cache directory:", cacheDir.error);
    return { error: cacheDir.error };
  }

  const template = templates.data.find((template) => template.isDefault);

  if (!template) {
    return { data: null };
  }

  const templateDto = template.mapToDTO();

  const revisions = templates.data.map((template) => template.findRootTemplate().commitHash!);

  return {
    data: {
      template: templateDto,
      revisions,
    },
  };
}

export async function retrieveAllTemplateRevisions(
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

export async function retrieveTemplateRevisionForProject(
  projectName: string,
): Promise<Result<TemplateDTO | null>> {
  const reloadResult = await PROJECT_REGISTRY.reloadProjects();
  if ("error" in reloadResult) {
    console.error("Failed to reload templates:", reloadResult.error);
    return { error: reloadResult.error };
  }
  const project = await PROJECT_REGISTRY.findProject(projectName);
  if ("error" in project) {
    console.error(project.error);
    return { error: project.error };
  }
  if (!project.data) {
    console.error(`Project ${projectName} not found`);
    return { error: `Project ${projectName} not found` };
  }

  const rootTemplateName = project.data.instantiatedProjectSettings.rootTemplateName;
  const commitHash = project.data.instantiatedProjectSettings.instantiatedTemplates[0]?.templateCommitHash;

  if (!commitHash) {
    console.error(`No commit hash found for project ${projectName}`);
    return { error: `No commit hash found for project ${projectName}` };
  }

  const revision = await ROOT_TEMPLATE_REGISTRY.loadRevision(rootTemplateName, commitHash);

  if ("error" in revision) {
    console.error(revision.error);
    return { error: revision.error };
  }
  if (!revision.data) {
    return { data: null };
  }
  const templateDto = revision.data.mapToDTO();

  return { data: templateDto };
}
