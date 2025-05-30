import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { ProjectCreationOptions, ProjectCreationResult, Result } from "../../lib";
import { instantiateProject } from "../../services/project-service";

export async function generateNewProject(
  projectName: string,
  templateName: string,
  newProjectParentDirPath: string,
  userTemplateSettings: UserTemplateSettings,
  projectCreationOptions?: ProjectCreationOptions
): Promise<Result<ProjectCreationResult>> {
  return await instantiateProject(
    templateName,
    newProjectParentDirPath,
    projectName,
    userTemplateSettings,
    projectCreationOptions
  );
}
