import { Result } from "../../lib";
import { Project } from "../../models";
import { resolveProjectRepository } from "../../repositories";

export async function getProjects(searchPath: string): Promise<Result<Project[]>> {
  const projectRepository = resolveProjectRepository();
  return await projectRepository.findProjects(searchPath);
}
