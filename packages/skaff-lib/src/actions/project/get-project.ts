import { Result } from "../../lib";
import { Project } from "../../models";
import { getProjectRepository } from "../../repositories";

export async function getProjectFromPath(
  projectPath: string
): Promise<Result<Project | null>> {
  const projectRepository = await getProjectRepository();
  return await projectRepository.loadProject(projectPath);
}

