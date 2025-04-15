'use server';
import { generateProjectFromTemplateSettings } from "@repo/ts/models/project-models";
import { deleteRepo, parseGitDiff } from "@repo/ts/services/git-service";
import { PROJECT_REGISTRY } from "@repo/ts/services/project-registry-service";
import { ROOT_TEMPLATE_REGISTRY } from "@repo/ts/services/root-template-registry-service";
import { TemplateGeneratorService } from "@repo/ts/services/template-generator-service";
import { PROJECT_SEARCH_PATHS } from "@repo/ts/utils/env";
import { ParsedFile, ProjectDTO, Result } from "@repo/ts/utils/types";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";

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

  PROJECT_REGISTRY.reloadProjects();

  return { data: instatiationResult.data };
}

export async function cancelProjectCreation(
  absoluteProjectPath: string,
): Promise<Result<void>> {
  let pathExists = false;
  for (const searchPath of PROJECT_SEARCH_PATHS) {
    if (absoluteProjectPath.startsWith(searchPath.path)) {
      pathExists = true;
      break;
    }
  }

  if (!pathExists) {
    return { error: "Invalid project path" };
  }

  const deleteResult = await deleteRepo(absoluteProjectPath);

  if (!deleteResult) {
    return { error: "Failed to delete project" };
  }

  PROJECT_REGISTRY.reloadProjects();

  return { data: undefined };
}

// instantiate new project has 2 actions. Generate project and see diff(will be left with staged changes). And commit all changes after user accepted.
// instantiate template in existing project has 3 actions. Generate diff, apply diff to project, and commit all changes after user accepted/fixed prs.

// This function will only need to be used when instantiating a template in an existing project not when creating a new project. Then we only need to commit the change. In this function we need to actually apply the patch to the existing project. Instatiation of a template in existing project is more complicated than just creating a new project.
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

// can be used by user manually.
export async function generateNewProjectFromExisting(currentProjectName: string, newProjectDestinationDirPathId: string, newProjectName: string): Promise<Result<string>> {
  const parentDirPath = PROJECT_SEARCH_PATHS.find((dir) => dir.id === newProjectDestinationDirPathId)?.path;
  if (!parentDirPath) {
    return { error: "Invalid project directory path ID" };
  }

  const result = await generateProjectFromTemplateSettings(currentProjectName, newProjectName, parentDirPath);

  if ("error" in result) {
    return { error: result.error };
  }

  return { data: result.data };
}
