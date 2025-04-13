import { ROOT_TEMPLATE_REGISTRY } from "@repo/ts/services/root-template-registry-service";
import { ParsedFile, ProjectDTO, Result } from "@repo/ts/utils/types";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { PROJECT_REGISTRY } from "@repo/ts/services/project-registry-service";
import { PROJECT_SEARCH_PATHS } from "@repo/ts/utils/env";
import { parseGitDiff } from "@repo/ts/services/git-service";

export interface ProjectCreationResult {
  newProject: ProjectDTO;
  diff: ParsedFile[];
}

export async function createNewProject(
  projectName: string,
  templateName: string,
  projectDirPathId: string,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<ProjectCreationResult>> {
  const parentDirPath = PROJECT_SEARCH_PATHS.find((dir) => dir.id === projectDirPathId)?.path;
  if (!parentDirPath) {
    return { error: "Invalid project directory path ID" };
  }

  const template = await ROOT_TEMPLATE_REGISTRY.findTemplate(templateName);

  if ("error" in template) {
    return { error: template.error };
  }

  const instatiationResult = await template.data.instantiateNewProject(
    userTemplateSettings,
    parentDirPath,
    projectName,
  );

  if ("error" in instatiationResult) {
    return { error: "Failed to create project" };
  }

  await PROJECT_REGISTRY.reloadProjects();

  const project = await PROJECT_REGISTRY.findProject(projectName);

  if (!project) {
    return { error: "Failed to create project" };
  }

  const processedDiff = parseGitDiff(instatiationResult.data.diff);

  return { data: { newProject: project.mapToDTO(), diff: processedDiff } };
}

export async function instantiateTemplate(
  rootTemplateName: string,
  templateName: string,
  parentInstanceId: string,
  destinationProjectName: string,
  userTemplateSettings: UserTemplateSettings,
): Promise<Result<string>> {
  const rootTemplate =
    await ROOT_TEMPLATE_REGISTRY.findTemplate(rootTemplateName);

  if ("error" in rootTemplate) {
    return { error: rootTemplate.error };
  }

  const template = rootTemplate.data.findSubTemplate(templateName);

  if (!template) {
    return { error: "Template not found" };
  }

  const destinationProject = await PROJECT_REGISTRY.findProject(
    destinationProjectName,
  );

  if (!destinationProject) {
    return { error: "Destination project not found" };
  }

  const instatiationResult = await template.templateInExistingProject(
    userTemplateSettings,
    destinationProject,
    parentInstanceId,
  );

  if ("error" in instatiationResult) {
    return { error: "Failed to instantiate template" };
  }

  return { data: instatiationResult.data };
}

// export async function commitAndFinalizeTemplateCreation(
//   projectName: string,
//   templateName: string,
// ): Promise<Result<string>> {
//   const project = await PROJECT_REGISTRY.findProject(projectName);
//
//   if (!project) {
//     return { error: "Project not found" };
//   }
//
//   const template = project.findTemplate(templateName);
//
//   if (!template) {
//     return { error: "Template not found" };
//   }
//
//
//   return { data: commitResult.data };
// }
