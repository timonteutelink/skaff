import path from "node:path";

import {
  ProjectSettings,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";

import { backendLogger } from "../../lib";
import {
  ProjectCreationOptions,
  ProjectCreationResult,
  Result,
} from "../../lib/types";
import { Project } from "../../models/project";
import {
  getProjectRepository,
  getRootTemplateRepository,
} from "../../repositories";
import {
  addAllAndRetrieveDiff,
  parseGitDiff,
} from "../../services/git-service";
import { TemplateGeneratorService } from "../../services/template-generator-service";

export class ProjectCreationManager {
  constructor(private readonly options?: ProjectCreationOptions) {}

  public async parseCreationResult(
    projectPath: string,
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

    if (!this.options?.git) {
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

  public async instantiateProject(
    rootTemplateName: string,
    parentDirPath: string,
    newProjectName: string,
    userTemplateSettings: UserTemplateSettings,
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

    return template.data.instantiateNewProject(
      userTemplateSettings,
      parentDirPath,
      newProjectName,
      this.options,
    );
  }

  public async generateFromExistingProject(
    existingProject: Project,
    newProjectPath: string,
  ): Promise<Result<ProjectCreationResult>> {
    return this.generateFromTemplateSettings(
      existingProject.instantiatedProjectSettings,
      newProjectPath,
    );
  }

  public async generateFromTemplateSettings(
    projectSettings: ProjectSettings,
    newProjectPath: string,
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

    if (rootTemplate.data.repoUrl) {
      const rootInst = projectSettings.instantiatedTemplates[0];
      if (rootInst) {
        rootInst.templateRepoUrl = rootTemplate.data.repoUrl;
        rootInst.templateBranch = rootTemplate.data.branch;
      }
    }

    const generator = new TemplateGeneratorService(
      {
        dontDoGit: !this.options?.git,
        dontAutoInstantiate: true,
        absoluteDestinationPath: newProjectPath,
      },
      rootTemplate.data,
      projectSettings,
    );

    const projectCreationResult =
      await generator.instantiateFullProjectFromSettings();

    if ("error" in projectCreationResult) {
      return projectCreationResult;
    }

    return this.parseCreationResult(projectCreationResult.data);
  }
}
