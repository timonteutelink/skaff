import {
  ProjectSettings,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import path from "node:path";
import {
  ProjectCreationResult,
  Result,
  ProjectCreationOptions,
} from "../lib/types";
import { Project } from "../models/project";
import {
  getProjectRepository,
  getRootTemplateRepository,
} from "../repositories";
import { addAllAndRetrieveDiff, parseGitDiff } from "./git-service";
import { TemplateGeneratorService } from "./template-generator-service";
import { backendLogger } from "../lib";

export async function parseProjectCreationResult(
  projectPath: string,
  projectCreationOptions?: ProjectCreationOptions,
): Promise<Result<ProjectCreationResult>> {
  const projectRepository = await getProjectRepository();
  const newProjectName = path.basename(projectPath);
  const newProjectParentDir = path.dirname(projectPath);

  const project = await projectRepository.findProjectByName(
    newProjectParentDir,
    newProjectName,
  );

  if ("error" in project) {
    return project;
  }

  if (!project.data) {
    backendLogger.error(`Project ${newProjectName} not found after creation`);
    return {
      error: "Failed to create project, project not found after creation",
    };
  }

  const projectDto = project.data.mapToDTO();

  if ("error" in projectDto) {
    return { error: projectDto.error };
  }

  if (!projectCreationOptions?.git) {
    return {
      data: { newProjectPath: projectPath, newProject: projectDto.data },
    };
  }

  const diffResult = await addAllAndRetrieveDiff(projectPath);

  if ("error" in diffResult) {
    return diffResult;
  }

  const processedDiff = parseGitDiff(diffResult.data);

  return {
    data: {
      newProjectPath: projectPath,
      newProject: projectDto.data,
      diff: processedDiff,
    },
  };
}

export async function instantiateProject(
  rootTemplateName: string,
  parentDirPath: string,
  newProjectName: string,
  userTemplateSettings: UserTemplateSettings,
  projectCreationOptions?: ProjectCreationOptions,
): Promise<Result<ProjectCreationResult>> {
  const rootTemplateRepository = await getRootTemplateRepository();
  const template = await rootTemplateRepository.findTemplate(rootTemplateName);

  if ("error" in template) {
    return template;
  }

  if (!template.data) {
    backendLogger.error(`Root template not found: ${rootTemplateName}`);
    return { error: "Root template not found" };
  }

  return await template.data.instantiateNewProject(
    userTemplateSettings,
    parentDirPath,
    newProjectName,
    projectCreationOptions,
  );
}

export async function generateProjectFromExistingProject(
  existingProject: Project,
  newProjectPath: string,
  ProjectCreationOptions?: ProjectCreationOptions,
): Promise<Result<ProjectCreationResult>> {
  return await generateProjectFromTemplateSettings(
    existingProject.instantiatedProjectSettings,
    newProjectPath,
    ProjectCreationOptions,
  );
}

/**
 * When git false only returns path to repo
 */
export async function generateProjectFromTemplateSettings(
  projectSettings: ProjectSettings,
  newProjectPath: string,
  projectCreationOptions?: ProjectCreationOptions,
): Promise<Result<ProjectCreationResult>> {
  const rootTemplateRepository = await getRootTemplateRepository();
  const rootInstantiated = projectSettings.instantiatedTemplates[0];
  if (rootInstantiated?.templateRepoUrl) {
    const addResult = await rootTemplateRepository.addRemoteRepo(
      rootInstantiated.templateRepoUrl,
      rootInstantiated.templateBranch ?? "main",
    );
    if ("error" in addResult) {
      return addResult;
    }
  }
  const instantiatedRootTemplate = rootInstantiated?.templateCommitHash;

  if (!instantiatedRootTemplate) {
    backendLogger.error(
      `No instantiated root template commit hash found in project settings`,
    );
    return {
      error:
        "No instantiated root template commit hash found in project settings",
    };
  }

  const rootTemplate = await rootTemplateRepository.loadRevision(
    projectSettings.rootTemplateName,
    instantiatedRootTemplate,
  );

  if ("error" in rootTemplate) {
    return rootTemplate;
  }

  if (!rootTemplate.data) {
    backendLogger.error(
      `Root template not found: ${projectSettings.rootTemplateName}`,
    );
    return { error: "Root template not found" };
  }

  // Ensure the root instantiated template stores repo information
  if (rootTemplate.data.repoUrl) {
    const rootInst = projectSettings.instantiatedTemplates[0];
    if (rootInst) {
      rootInst.templateRepoUrl = rootTemplate.data.repoUrl;
      rootInst.templateBranch = rootTemplate.data.branch;
    }
  }

  const newProjectGenerator = new TemplateGeneratorService(
    {
      dontDoGit: !projectCreationOptions?.git,
      dontAutoInstantiate: true,
      absoluteDestinationPath: newProjectPath,
    },
    rootTemplate.data,
    projectSettings,
  );

  const projectCreationResult =
    await newProjectGenerator.instantiateFullProjectFromSettings();

  if ("error" in projectCreationResult) {
    return projectCreationResult;
  }

  return await parseProjectCreationResult(
    projectCreationResult.data,
    projectCreationOptions,
  );
}
