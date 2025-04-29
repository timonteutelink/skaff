"use server";
import { getCacheDir } from "@repo/ts/services/cache-service";
import { PROJECT_REGISTRY } from "@repo/ts/services/project-registry-service";
import { ROOT_TEMPLATE_REGISTRY } from "@repo/ts/services/root-template-registry-service";
import { DefaultTemplateResult, Result, TemplateDTO } from "@repo/ts/lib/types";
import { logger } from "@repo/ts/lib/logger";

export async function eraseCache(): Promise<Result<DefaultTemplateResult[]>> {
  const eraseResult = await eraseCache();
  if ("error" in eraseResult) {
    return { error: eraseResult.error };
  }

  const reloadResult = await ROOT_TEMPLATE_REGISTRY.reloadTemplates();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  const allNewTemplates = await retrieveDefaultTemplates();

  if ("error" in allNewTemplates) {
    return { error: allNewTemplates.error };
  }

  return { data: allNewTemplates.data };
}

export async function reloadTemplates(): Promise<Result<DefaultTemplateResult[]>> {
  const result = await ROOT_TEMPLATE_REGISTRY.reloadTemplates();

  if ("error" in result) {
    return { error: result.error };
  }

  const allNewTemplates = await retrieveDefaultTemplates();

  if ("error" in allNewTemplates) {
    return { error: allNewTemplates.error };
  }

  return { data: allNewTemplates.data };
}

export async function retrieveDefaultTemplates(): Promise<Result<DefaultTemplateResult[]>> {
  const templates = await ROOT_TEMPLATE_REGISTRY.getAllTemplates();

  if ("error" in templates) {
    return { error: templates.error };
  }

  const cacheDir = await getCacheDir();

  if ("error" in cacheDir) {
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
    return { error: templates.error };
  }
  if (!templates.data) {
    return { data: null };
  }

  const cacheDir = await getCacheDir();

  if ("error" in cacheDir) {
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
    return { error: reloadResult.error };
  }
  const project = await PROJECT_REGISTRY.findProject(projectName);
  if ("error" in project) {
    return { error: project.error };
  }
  if (!project.data) {
    return { data: null };
  }

  const rootTemplateName = project.data.instantiatedProjectSettings.rootTemplateName;
  const commitHash = project.data.instantiatedProjectSettings.instantiatedTemplates[0]?.templateCommitHash;

  if (!commitHash) {
    logger.error(`No commit hash found for project ${projectName}`);
    return { error: `No commit hash found for project ${projectName}` };
  }

  const revision = await ROOT_TEMPLATE_REGISTRY.loadRevision(rootTemplateName, commitHash);

  if ("error" in revision) {
    return { error: revision.error };
  }
  if (!revision.data) {
    return { data: null };
  }
  const templateDto = revision.data.mapToDTO();

  return { data: templateDto };
}
