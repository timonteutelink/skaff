import path from "node:path";
import {
  getConfig,
  ProjectCreationResult,
  ProjectSettings,
  ProjectSettingsSchema,
  Result,
} from "../../lib";
import { logError } from "../../lib/utils";
import { getProjectRepository } from "../../repositories";
import { generateProjectFromTemplateSettings } from "../../services/project-service";
import { projectSearchPathKey } from "../../utils/shared-utils";

export async function generateNewProjectFromSettings(
  projectSettingsJson: string,
  projectDirPathId: string,
  newProjectDirName: string,
): Promise<Result<ProjectCreationResult>> {
  const config = await getConfig();
  const projectRepository = await getProjectRepository();
  let parsedProjectSettings: ProjectSettings | undefined;

  try {
    parsedProjectSettings = ProjectSettingsSchema.parse(
      JSON.parse(projectSettingsJson),
    );
  } catch (error) {
    logError({
      error,
      shortMessage: "Failed to parse project settings.",
    });
    return { error: `Failed to parse project settings.` };
  }

  parsedProjectSettings.projectName = newProjectDirName;

  const reloadResult = await projectRepository.reloadProjects();
  if ("error" in reloadResult) {
    return { error: reloadResult.error };
  }

  const parentDirPath = projectSearchPathKey(
    config.PROJECT_SEARCH_PATHS.find(
      (dir) => projectSearchPathKey(dir) === projectDirPathId,
    ),
  );

  if (!parentDirPath) {
    logError({
      shortMessage: `Invalid project directory path ID: ${projectDirPathId}`,
    });
    return { error: `Invalid project directory path ID: ${projectDirPathId}` };
  }

  const result = await generateProjectFromTemplateSettings(
    parsedProjectSettings,
    path.join(parentDirPath, newProjectDirName),
    true,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data as ProjectCreationResult };
}
