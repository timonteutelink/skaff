import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { ProjectCreationOptions, ProjectCreationResult, Result } from "../../lib";
import { resolveProjectCreationManager } from "../../core/projects/ProjectCreationManager";

export async function generateNewProject(
  projectName: string,
  templateName: string,
  newProjectParentDirPath: string,
  userTemplateSettings: UserTemplateSettings,
  projectCreationOptions?: ProjectCreationOptions
): Promise<Result<ProjectCreationResult>> {
  const projectCreationManager = resolveProjectCreationManager();
  return await projectCreationManager.instantiateProject(
    templateName,
    newProjectParentDirPath,
    projectName,
    userTemplateSettings,
    projectCreationOptions,
  );
}
