import { logger, ParsedFile, Result } from "../../lib";
import { getProjectRepository } from "../../repositories";
import {
  addAllAndRetrieveDiff,
  parseGitDiff,
} from "../../services/git-service";

export async function addAllAndDiff(
  projectName: string,
): Promise<Result<ParsedFile[]>> {
  const projectRepository = await getProjectRepository();
  const project = await projectRepository.findProject(projectName);
  if ("error" in project) {
    return project;
  }

  if (!project.data) {
    logger.error(`Project ${projectName} not found`);
    return { error: "Project not found" };
  }

  const addAllResult = await addAllAndRetrieveDiff(
    project.data.absoluteRootDir,
  );

  if ("error" in addAllResult) {
    return addAllResult;
  }

  return { data: parseGitDiff(addAllResult.data) };
}
