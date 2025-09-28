import path from "node:path";
import { ProjectCreationOptions, ProjectCreationResult, Result } from "../../lib";
import { Project } from "../../models";
import { resolveProjectCreationManager } from "../../core/projects/ProjectCreationManager";

export async function generateNewProjectFromExisting(
  oldProject: Project,
  newProjectDestinationDirPath: string,
  newProjectName: string,
  projectCreationOptions?: ProjectCreationOptions
): Promise<Result<ProjectCreationResult>> {
  const newSettings = { ...oldProject.instantiatedProjectSettings, projectName: newProjectName };

  const projectCreationManager = resolveProjectCreationManager();

  const result = await projectCreationManager.generateFromTemplateSettings(
    newSettings,
    path.join(newProjectDestinationDirPath, newProjectName),
    projectCreationOptions
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}
