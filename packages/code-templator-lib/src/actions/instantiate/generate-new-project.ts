import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { ProjectCreationResult, Result } from "../../lib";
import { instantiateProject } from "../../services/project-service";

export async function generateNewProject(
  projectName: string,
  templateName: string,
  newProjectParentDirPath: string,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<ProjectCreationResult>> {
  const result = await instantiateProject(
    templateName,
    newProjectParentDirPath,
    projectName,
    userTemplateSettings,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}
