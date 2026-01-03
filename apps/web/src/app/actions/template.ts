"use server";

import "server-only";

import { findProject } from "@/lib/server-utils";
import type {
  Result,
  TemplateDTO,
  TemplateSummary,
  TemplateRepoLoadResult,
} from "@timonteutelink/skaff-lib";

const loadSkaffLib = () => import("@timonteutelink/skaff-lib");

export async function runEraseCache(): Promise<
  Result<TemplateSummary[]>
> {
  const tempLib = await loadSkaffLib();
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
  branch?: string,
  revision?: string,
  options?: { refresh?: boolean },
): Promise<Result<TemplateRepoLoadResult>> {
  const tempLib = await loadSkaffLib();
  const result = await tempLib.loadTemplateFromRepo(repoUrl, branch, {
    refresh: options?.refresh,
    revision,
  });
  if ("error" in result) {
    return { error: result.error };
  }
  return { data: result.data };
}

export async function refreshTemplateRepo(
  repoUrl: string,
  branch?: string,
  revision?: string,
): Promise<Result<void>> {
  const tempLib = await loadSkaffLib();
  const result = await tempLib.loadTemplateFromRepo(repoUrl, branch, {
    refresh: true,
    revision,
  });
  if ("error" in result) {
    return { error: result.error };
  }
  return { data: undefined };
}

export async function reloadTemplates(): Promise<
  Result<TemplateSummary[]>
> {
  const tempLib = await loadSkaffLib();
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
  const tempLib = await loadSkaffLib();
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
  const tempLib = await loadSkaffLib();
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
  const tempLib = await loadSkaffLib();
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
  projectRepositoryName: string,
): Promise<Result<TemplateDTO | null>> {
  const project = await findProject(projectRepositoryName);

  if ('error' in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectRepositoryName} not found.` };
  }

  const tempLib = await loadSkaffLib();
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
