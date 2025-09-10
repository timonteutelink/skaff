"use server";

import { findProject, listProjects } from "@/lib/server-utils";
import * as tempLib from "@timonteutelink/skaff-lib";
import { ProjectDTO, Result } from "@timonteutelink/skaff-lib";

export async function retrieveProjectSearchPaths(): Promise<
  { id: string; path: string }[]
> {
  const config = await tempLib.getConfig();
  return config.PROJECT_SEARCH_PATHS.map((dir) => ({
    id: tempLib.projectSearchPathKey(dir)!,
    path: dir,
  }));
}

export async function retrieveProjects(): Promise<Result<ProjectDTO[]>> {
  const projects = await listProjects();

  if ("error" in projects) {
    return { error: projects.error}
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
  projectName: string,
): Promise<Result<ProjectDTO | null>> {
  const project = await findProject(projectName);
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

export async function runProjectCommand(
  projectName: string,
  templateInstanceId: string,
  commandTitle: string,
): Promise<Result<string>> {
  const project = await findProject(projectName);

  if ('error' in project) {
    return { error: project.error };
  }

  if (!project.data) {
    return { error: `Project ${projectName} not found.` };
  }

  return await project.data.executeTemplateCommand(
    templateInstanceId,
    commandTitle,
  );
}
