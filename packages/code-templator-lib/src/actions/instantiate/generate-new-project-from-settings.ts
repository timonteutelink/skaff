import path from "node:path";
import {
  ProjectCreationResult,
  ProjectSettings,
  ProjectSettingsSchema,
  Result,
  ProjectCreationOptions
} from "../../lib";
import { logError } from "../../lib/utils";
import { generateProjectFromTemplateSettings } from "../../services/project-service";

export async function generateNewProjectFromSettings(
  projectSettingsJson: string,
  newProjectDirPath: string,
  newProjectDirName: string,
  projectCreationOptions?: ProjectCreationOptions,
): Promise<Result<ProjectCreationResult>> {
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

  return await generateProjectFromTemplateSettings(
    parsedProjectSettings,
    path.join(newProjectDirPath, newProjectDirName),
    projectCreationOptions
  );
}
