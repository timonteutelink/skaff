import path from "node:path";
import { ProjectCreationOptions, ProjectCreationResult, Result } from "../../lib";
import { Project } from "../../models";
import { resolveProjectCreationManager } from "../../core/projects/ProjectCreationManager";

export async function generateNewProjectFromExisting(
  oldProject: Project,
  newProjectDestinationDirPath: string,
  newProjectRepositoryName: string,
  projectCreationOptions?: ProjectCreationOptions
): Promise<Result<ProjectCreationResult>> {
  const newSettings = {
    ...oldProject.instantiatedProjectSettings,
    projectRepositoryName: newProjectRepositoryName,
  };

  const projectCreationManager = resolveProjectCreationManager();

  const result = await projectCreationManager.generateFromTemplateSettings(
    newSettings,
    path.join(newProjectDestinationDirPath, newProjectRepositoryName),
    projectCreationOptions
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}
