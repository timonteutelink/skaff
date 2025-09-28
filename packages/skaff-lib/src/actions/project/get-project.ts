import { Result } from "../../lib";
import { Project } from "../../models";
import { resolveProjectRepository } from "../../repositories";

export async function getProjectFromPath(
  projectPath: string
): Promise<Result<Project | null>> {
  const projectRepository = resolveProjectRepository();
  return await projectRepository.loadProject(projectPath);
}

