"use server";

import * as tempLib from "@timonteutelink/code-templator-lib";
import { ProjectDTO, Result } from "@timonteutelink/code-templator-lib";

export async function retrieveProjectSearchPaths(): Promise<
  { id: string; path: string }[]
> {
  return tempLib.getSearchPaths();
}

export async function retrieveProjects(): Promise<Result<ProjectDTO[]>> {
  return tempLib.getProjects();
}

export async function retrieveProject(
  projectName: string,
): Promise<Result<ProjectDTO | null>> {
  return tempLib.getProject(projectName);
}

export async function runProjectCommand(
  projectName: string,
  templateInstanceId: string,
  commandTitle: string,
): Promise<Result<string>> {
  return tempLib.runProjectCommand(
    projectName,
    templateInstanceId,
    commandTitle,
  );
}
