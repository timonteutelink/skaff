import path from "node:path";
import { Result } from "../../lib/types";
import { ProjectSettings } from "@timonteutelink/template-types-lib";
import { ProjectSettingsManager } from "./ProjectSettingsManager";

export async function writeNewProjectSettings(
  absoluteProjectPath: string,
  projectSettings: ProjectSettings,
  overwrite?: boolean,
): Promise<Result<void>> {
  const manager = new ProjectSettingsManager(absoluteProjectPath);
  return manager.writeInitialSettings(projectSettings, overwrite);
}

export async function writeProjectSettings(
  absoluteProjectPath: string,
  projectSettings: ProjectSettings,
  overwrite?: boolean,
): Promise<Result<void>> {
  const manager = new ProjectSettingsManager(absoluteProjectPath);
  return manager.writeSettings(projectSettings, overwrite);
}

export async function writeNewTemplateToSettings(
  absoluteProjectPath: string,
  instantiatedTemplate: Parameters<
    ProjectSettingsManager["appendTemplate"]
  >[0],
): Promise<Result<void>> {
  const manager = new ProjectSettingsManager(absoluteProjectPath);
  return manager.appendTemplate(instantiatedTemplate);
}

export async function removeTemplateFromSettings(
  absoluteProjectPath: string,
  templateInstanceId: string,
): Promise<Result<void>> {
  const manager = new ProjectSettingsManager(absoluteProjectPath);
  return manager.removeTemplate(templateInstanceId);
}

export async function loadProjectSettings(
  projectSettingsPath: string,
): Promise<ReturnType<ProjectSettingsManager["load"]>> {
  const manager = new ProjectSettingsManager(
    path.dirname(projectSettingsPath),
  );
  return manager.load();
}
