"use server";

import "server-only";

import { findProject, listProjects } from "@/lib/server-utils";
import { ensureWebPluginsRegistered } from "@/lib/plugins/register-plugins";
import type { ProjectDTO, Result } from "@timonteutelink/skaff-lib";
import { createReadonlyProjectContext } from "@timonteutelink/template-types-lib";

ensureWebPluginsRegistered();

const loadSkaffLib = () => import("@timonteutelink/skaff-lib");

export async function retrieveProjectSearchPaths(): Promise<
  { id: string; path: string }[]
> {
  const tempLib = await loadSkaffLib();
  const config = await tempLib.getConfig();
  return config.PROJECT_SEARCH_PATHS.map((dir) => ({
    id: tempLib.projectSearchPathKey(dir)!,
    path: dir,
  }));
}

export async function retrieveProjects(): Promise<Result<ProjectDTO[]>> {
  const projects = await listProjects();

  if ("error" in projects) {
    return { error: projects.error };
  }

  if (!projects.data || projects.data.length === 0) {
    return { data: [] };
  }

  const projectDTOs: ProjectDTO[] = [];

  for (const project of projects.data) {
    const projectDTOResult = project.mapToDTO();

    if ("error" in projectDTOResult) {
      return { error: projectDTOResult.error };
    }
    projectDTOs.push(projectDTOResult.data);
  }
  return { data: projectDTOs };
}

export async function retrieveProject(
  projectRepositoryName: string,
): Promise<Result<ProjectDTO | null>> {
  const project = await findProject(projectRepositoryName);
  if ("error" in project) {
    return { error: project.error };
  }
  if (!project.data) {
    return { data: null };
  }
  const projectDTOResult = project.data.mapToDTO();
  if ("error" in projectDTOResult) {
    return { error: projectDTOResult.error };
  }
  return { data: projectDTOResult.data };
}

export async function retrieveProjectPluginNotices(
  projectRepositoryName: string,
): Promise<Result<{ project: string; notices: string[] }>> {
  const project = await findProject(projectRepositoryName);

  if ("error" in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectRepositoryName} not found.` };
  }

  const tempLib = await loadSkaffLib();
  const pluginsResult = await tempLib.loadPluginsForTemplate(
    project.data.rootTemplate,
    createReadonlyProjectContext(project.data.instantiatedProjectSettings),
  );

  if ("error" in pluginsResult) {
    return { error: pluginsResult.error };
  }

  const notices: string[] = [];

  for (const plugin of pluginsResult.data) {
    if (!plugin.webPlugin?.getNotices) continue;
    try {
      const settings = project.data.instantiatedProjectSettings;
      const pluginNotices = await plugin.webPlugin.getNotices({
        projectRepositoryName: settings.projectRepositoryName,
        projectAuthor: settings.projectAuthor,
        rootTemplateName: project.data.rootTemplate.config.templateConfig.name,
        templateCount: settings.instantiatedTemplates.length,
        rootTemplate: tempLib.createTemplateView(project.data.rootTemplate),
      });
      if (pluginNotices?.length) {
        notices.push(...pluginNotices);
      }
    } catch (error) {
      return {
        error: `Failed to resolve plugin notices: ${error}`,
      };
    }
  }

  return { data: { project: projectRepositoryName, notices } };
}

export async function runProjectCommand(
  projectRepositoryName: string,
  templateInstanceId: string,
  commandTitle: string,
): Promise<Result<string>> {
  const project = await findProject(projectRepositoryName);

  if ("error" in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectRepositoryName} not found.` };
  }

  return await project.data.executeTemplateCommand(
    templateInstanceId,
    commandTitle,
  );
}
