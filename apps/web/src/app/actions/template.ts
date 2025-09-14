"use server";

import { findProject } from "@/lib/server-utils";
import * as tempLib from "@timonteutelink/skaff-lib";
import { Result, TemplateDTO, TemplateSummary } from "@timonteutelink/skaff-lib";

export async function runEraseCache(): Promise<
  Result<TemplateSummary[]>
> {
  const result = await tempLib.eraseCache();
  if ('error' in result) {
    return { error: result.error };
  }
  return {
    data: result.data.map((template) => ({
      revisions: template.revisions,
      template: template.template.mapToDTO(),
    })),
  };
}

export async function loadTemplateRepo(
  repoUrl: string,
  branch: string,
): Promise<Result<void>> {
  const result = await tempLib.loadTemplateFromRepo(repoUrl, branch);
  if ("error" in result) {
    return { error: result.error };
  }
  return { data: undefined };
}

export async function reloadTemplates(): Promise<
  Result<TemplateSummary[]>
> {
  const result = await tempLib.reloadTemplates();
  if ('error' in result) {
    return { error: result.error };
  }
  return {
    data: result.data.map((template) => ({
      revisions: template.revisions,
      template: template.template.mapToDTO(),
    })),
  };
}

export async function retrieveTemplates(): Promise<
  Result<TemplateSummary[]>
> {
  const result = await tempLib.getTemplates();
  if ("error" in result) {
    return { error: result.error };
  }
  return {
    data: result.data.map((template) => ({
      revisions: template.revisions,
      template: template.template.mapToDTO(),
    })),
  };
}

export async function retrieveTemplate(
  templateName: string,
): Promise<Result<TemplateSummary | null>> {
  const result = await tempLib.getTemplate(templateName);
  if ("error" in result) {
    return { error: result.error };
  }
  if (!result.data) {
    return { data: null };
  }
  return {
    data: {
      ...result.data,
      template: result.data.template.mapToDTO(),
    },
  };
}

export async function retrieveAllTemplateRevisions(
  templateName: string,
): Promise<Result<TemplateDTO[] | null>> {
  const result = await tempLib.getLoadedRevisions(templateName);
  if ('error' in result) {
    return { error: result.error };
  }
  if (!result.data) {
    return { data: null };
  }
  return {
    data: result.data.map((template) => template.mapToDTO()),
  };
}

export async function retrieveTemplateRevisionForProject(
  projectName: string,
): Promise<Result<TemplateDTO | null>> {
  const project = await findProject(projectName);

  if ('error' in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectName} not found.` };
  }

  const result = await tempLib.loadProjectTemplateRevision(project.data);

  if ('error' in result) {
    return { error: result.error };
  }

  if (!result.data) {
    return { data: null };
  }

  return {
    data: result.data.mapToDTO(),
  };
}
