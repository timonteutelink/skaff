import path from "node:path";

import {
  ProjectSettings,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";

import { backendLogger } from "../../lib";
import type {
  ProjectCreationOptions,
  ProjectCreationResult,
  Result,
} from "../../lib/types";
import { Project } from "../../models/project";
import { ProjectRepository } from "../../repositories/project-repository";
import type { RootTemplateRepository } from "../../repositories/root-template-repository";
import { GitService } from "../infra/git-service";
import { inject, injectable, delay } from "tsyringe";
import { TemplateGeneratorService } from "../generation/template-generator-service";
import { getSkaffContainer } from "../../di/container";
import { ROOT_TEMPLATE_REPOSITORY_TOKEN } from "../../repositories/tokens";

@injectable()
export class ProjectCreationManager {
  constructor(
    @inject(delay(() => ProjectRepository))
    private readonly projectRepository: ProjectRepository,
    @inject(ROOT_TEMPLATE_REPOSITORY_TOKEN)
    private readonly rootTemplateRepository: RootTemplateRepository,
    @inject(GitService)
    private readonly gitService: GitService,
    @inject(TemplateGeneratorService)
    private readonly templateGenerator: TemplateGeneratorService,
  ) {}

  public async parseCreationResult(
    projectPath: string,
    options?: ProjectCreationOptions,
  ): Promise<Result<ProjectCreationResult>> {
    const projectRepository = this.projectRepository;
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

    if (!options?.git) {
      return {
        data: { newProjectPath: projectPath, newProject: projectDto.data },
      };
    }

    const diffResult = await this.gitService.addAllAndRetrieveDiff(projectPath);

    if ("error" in diffResult) {
      return diffResult;
    }

    const processedDiff = this.gitService.parseGitDiff(diffResult.data);

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
    projectCreationOptions?: ProjectCreationOptions,
  ): Promise<Result<ProjectCreationResult>> {
    const template = await this.rootTemplateRepository.findTemplate(
      rootTemplateName,
    );

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
      projectCreationOptions,
      this.templateGenerator,
    );
  }

  public async generateFromExistingProject(
    existingProject: Project,
    newProjectPath: string,
    projectCreationOptions?: ProjectCreationOptions,
  ): Promise<Result<ProjectCreationResult>> {
    return this.generateFromTemplateSettings(
      existingProject.instantiatedProjectSettings,
      newProjectPath,
      projectCreationOptions,
    );
  }

  public async generateFromTemplateSettings(
    projectSettings: ProjectSettings,
    newProjectPath: string,
    projectCreationOptions?: ProjectCreationOptions,
  ): Promise<Result<ProjectCreationResult>> {
    const rootInstantiated = projectSettings.instantiatedTemplates[0];

    if (rootInstantiated?.templateRepoUrl) {
      const addResult = await this.rootTemplateRepository.addRemoteRepo(
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

    const rootTemplate = await this.rootTemplateRepository.loadRevision(
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

    const generatorSession = this.templateGenerator.createSession(
      {
        dontDoGit: !projectCreationOptions?.git,
        dontAutoInstantiate: true,
        absoluteDestinationPath: newProjectPath,
      },
      rootTemplate.data,
      projectSettings,
    );

    const projectCreationResult =
      await generatorSession.instantiateFullProjectFromSettings();

    if ("error" in projectCreationResult) {
      return projectCreationResult;
    }

    return this.parseCreationResult(
      projectCreationResult.data,
      projectCreationOptions,
    );
  }
}

export function resolveProjectCreationManager(): ProjectCreationManager {
  return getSkaffContainer().resolve(ProjectCreationManager);
}

