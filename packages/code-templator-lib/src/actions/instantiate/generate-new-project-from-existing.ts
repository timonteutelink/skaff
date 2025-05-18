import path from "node:path";
import { getConfig, Result } from "../../lib";
import { logError } from "../../lib/utils";
import { getProjectRepository } from "../../repositories";
import { generateProjectFromTemplateSettings } from "../../services/project-service";
import { projectSearchPathKey } from "../../utils/shared-utils";

export async function generateNewProjectFromExisting(
  currentProjectName: string,
  newProjectDestinationDirPathId: string,
  newProjectName: string,
): Promise<Result<string>> {
  const config = await getConfig();
  const projectRepository = await getProjectRepository();
  const reloadResult = await projectRepository.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  const parentDirPath = projectSearchPathKey(
    config.PROJECT_SEARCH_PATHS.find(
      (dir) => projectSearchPathKey(dir) === newProjectDestinationDirPathId,
    ),
  );

  if (!parentDirPath) {
    logError({
      shortMessage: `Invalid project directory path ID: ${newProjectDestinationDirPathId}`,
    });
    return {
      error: `Invalid project directory path ID: ${newProjectDestinationDirPathId}`,
    };
  }

  const project = await projectRepository.findProject(currentProjectName);

  if ("error" in project) {
    return { error: project.error };
  }

  if (!project.data) {
    logError({ shortMessage: `Project ${currentProjectName} not found` });
    return { error: `Project ${currentProjectName} not found` };
  }

  project.data.instantiatedProjectSettings.projectName = newProjectName;

  const result = await generateProjectFromTemplateSettings(
    project.data.instantiatedProjectSettings,
    path.join(parentDirPath, newProjectName),
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data as string };
}
