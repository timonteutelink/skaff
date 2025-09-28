import path from "node:path";
import {
  ProjectCreationResult,
  Result,
  ProjectCreationOptions
} from "../../lib";
import { logError } from "../../lib/utils";
import { resolveProjectCreationManager } from "../../core/projects/ProjectCreationManager";
import { ProjectSettings, projectSettingsSchema } from "@timonteutelink/template-types-lib";

export async function generateNewProjectFromSettings(
  projectSettingsJson: string,
  newProjectDirPath: string,
  newProjectDirName: string,
  projectCreationOptions?: ProjectCreationOptions,
): Promise<Result<ProjectCreationResult>> {
  let parsedProjectSettings: ProjectSettings | undefined;

  try {
    parsedProjectSettings = projectSettingsSchema.parse(
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

  const projectCreationManager = resolveProjectCreationManager();

  return await projectCreationManager.generateFromTemplateSettings(
    parsedProjectSettings,
    path.join(newProjectDirPath, newProjectDirName),
    projectCreationOptions
  );
}
