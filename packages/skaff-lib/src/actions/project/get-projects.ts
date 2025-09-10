import { Result } from "../../lib";
import { Project } from "../../models";
import { getProjectRepository } from "../../repositories";

export async function getProjects(searchPath: string): Promise<Result<Project[]>> {
  const projectRepository = await getProjectRepository();
  return await projectRepository.findProjects(searchPath);
}
