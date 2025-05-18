import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { getConfig, ProjectCreationResult, Result } from "../../lib";
import { getProjectRepository } from "../../repositories";
import { instantiateProject } from "../../services/project-service";
import { logError } from "../../lib/utils";
import { projectSearchPathKey } from "../../utils/shared-utils";

export async function generateNewProject(
  projectName: string,
  templateName: string,
  projectDirPathId: string,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<ProjectCreationResult>> {
  const projectRepository = await getProjectRepository();
  const config = await getConfig();
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

  const result = await instantiateProject(
    templateName,
    parentDirPath,
    projectName,
    userTemplateSettings,
  );

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}
