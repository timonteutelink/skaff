import {
  ProjectSettings,
  TemplateParentReference,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import path from "node:path";

import { glob } from "glob";
import z from "zod";

import {
  GenericTemplateConfigModule,
  ProjectCreationOptions,
  ProjectCreationResult,
  Result,
  TemplateDTO,
} from "../../lib/types";
import { backendLogger } from "../../lib/logger";
import { logError } from "../../lib/utils";
import {
  TemplateGeneratorService,
  resolveTemplateGeneratorService,
} from "../generation/template-generator-service";
import { Project } from "../../models/project";
import { resolveProjectCreationManager } from "../projects/ProjectCreationManager";
import { CacheService } from "../infra/cache-service";
import { resolveGitService } from "../infra/git-service";

function getGitService() {
  return resolveGitService();
}

function getProjectCreationManager() {
  return resolveProjectCreationManager();
}

export interface TemplateInit {
  config: GenericTemplateConfigModule;
  absoluteBaseDir: string;
  absoluteDir: string;
  absoluteFilesDir: string;
  commitHash?: string;
  branch?: string;
  repoUrl?: string;
  trackedRevision?: string;
  refDir?: string;
  partialsDir?: string;
}

export class Template {
  public config: GenericTemplateConfigModule;
  public subTemplates: Record<string, Template[]> = {};
  public parentTemplate?: Template;

  public foundPartials?: Record<string, string>;

  public absoluteBaseDir: string;
  public absoluteDir: string;
  public relativeDir: string;

  public absoluteFilesDir: string;
  public relativeFilesDir: string;

  public absolutePartialsDir?: string;
  public relativePartialsDir?: string;

  public relativeRefDir?: string;

  public commitHash?: string;
  public isLocal: boolean = false;
  public branch?: string;
  public repoUrl?: string;
  public trackedRevision?: string;
  public possibleParentTemplates: TemplateParentReference[] = [];
  public isDetachedSubtreeRoot: boolean = false;

  constructor(init: TemplateInit) {
    this.config = init.config;

    this.absoluteBaseDir = init.absoluteBaseDir;
    this.absoluteDir = init.absoluteDir;
    this.relativeDir = path.relative(init.absoluteBaseDir, init.absoluteDir);

    this.absoluteFilesDir = init.absoluteFilesDir;
    this.relativeFilesDir = path.relative(
      init.absoluteBaseDir,
      init.absoluteFilesDir,
    );

    this.absolutePartialsDir = init.partialsDir
      ? path.resolve(init.absoluteBaseDir, init.partialsDir)
      : undefined;
    this.relativePartialsDir = init.partialsDir;

    this.relativeRefDir = init.refDir;

    this.commitHash = init.commitHash;
    this.branch = init.branch;
    this.repoUrl = init.repoUrl;
    this.trackedRevision = init.trackedRevision;
    this.possibleParentTemplates =
      init.config.possibleParentTemplates ?? [];
    this.isDetachedSubtreeRoot = this.possibleParentTemplates.length > 0;

    if (!this.absoluteBaseDir.startsWith(CacheService.getCacheDirPath())) {
      this.isLocal = true;
    }
  }

  public async templateInExistingProject(
    userSettings: UserTemplateSettings,
    destinationProject: Project,
    parentInstanceId: string,
  ): Promise<Result<string>> {
    const generatorService = resolveTemplateGeneratorService();
    const generatorSession = generatorService.createSession(
      { absoluteDestinationPath: destinationProject.absoluteRootDir },
      this,
      destinationProject.instantiatedProjectSettings,
    );

    const addTemplateResult = generatorSession.addNewTemplate(
      userSettings,
      this.config.templateConfig.name,
      parentInstanceId,
    );

    if ("error" in addTemplateResult) {
      return addTemplateResult;
    }

    const resultPath = await generatorSession.instantiateTemplateInProject(
      addTemplateResult.data,
      { removeOnFailure: true },
    );

    if ("error" in resultPath) {
      return resultPath;
    }

    backendLogger.info(
      `Template instantiated at: ${resultPath.data.targetPath}`,
    );
    return { data: resultPath.data.targetPath };
  }

  public async instantiateNewProject(
    rootTemplateSettings: UserTemplateSettings,
    destinationDir: string,
    projectRepositoryName: string,
    projectCreationOptions?: ProjectCreationOptions,
    templateGeneratorService?: TemplateGeneratorService,
  ): Promise<Result<ProjectCreationResult>> {
    const newProjectSettings: ProjectSettings = {
      projectRepositoryName,
      projectAuthor: "abc",
      rootTemplateName: this.config.templateConfig.name,
      instantiatedTemplates: [],
    };

    const generatorService =
      templateGeneratorService ?? resolveTemplateGeneratorService();
    const generatorSession = generatorService.createSession(
      {
        absoluteDestinationPath: path.join(destinationDir, projectRepositoryName),
        dontDoGit: !projectCreationOptions?.git,
      },
      this,
      newProjectSettings,
    );
    const addProjectResult =
      generatorSession.addNewProject(rootTemplateSettings);

    if ("error" in addProjectResult) {
      return addProjectResult;
    }

    const result = await generatorSession.instantiateNewProject();
    if ("error" in result) {
      return result;
    }

    backendLogger.info(`New project created at: ${result.data}`);
    return await getProjectCreationManager().parseCreationResult(
      result.data,
      projectCreationOptions,
    );
  }

  public mapToDTO(): TemplateDTO {
    const subTemplates: Record<string, TemplateDTO[]> = {};
    for (const [key, value] of Object.entries(this.subTemplates)) {
      subTemplates[key] = value.map((template) => template.mapToDTO());
    }

    return {
      dir: this.relativeDir,
      config: {
        templateConfig: this.config.templateConfig,
        templateSettingsSchema: z.toJSONSchema(
          this.config.templateSettingsSchema,
        ),
      },
      filesDir: this.relativeFilesDir,
      subTemplates,
      refDir: this.relativeRefDir,
      currentCommitHash: this.commitHash,
      templatesThatDisableThis: this.config.templatesThatDisableThis || [],
      templateCommands:
        this.config.commands?.map((command) => ({
          title: command.title,
          description: command.description,
        })) || [],
      isLocal: this.isLocal,
      branch: this.branch,
      repoUrl: this.repoUrl,
      trackedRevision: this.trackedRevision,
      possibleParentTemplates: this.possibleParentTemplates,
      isDetachedSubtreeRoot: this.isDetachedSubtreeRoot,
      plugins: this.config.plugins ?? [],
    };
  }

  public findSubTemplate(templateName: string): Template | null {
    if (this.config.templateConfig.name === templateName) {
      return this;
    }
    for (const subTemplate of Object.values(this.subTemplates)) {
      for (const template of subTemplate) {
        if (template.config.templateConfig.name === templateName) {
          return template;
        }
        const deeper = template.findSubTemplate(templateName);
        if (deeper) {
          return deeper;
        }
      }
    }
    return null;
  }

  public findRootTemplate(): Template {
    if (this.isDetachedSubtreeRoot || !this.parentTemplate) {
      return this;
    }
    return this.parentTemplate.findRootTemplate();
  }

  public findCommitHash(): string {
    if (this.commitHash) {
      return this.commitHash;
    }
    if (this.parentTemplate && !this.parentTemplate.isDetachedSubtreeRoot) {
      return this.parentTemplate.findCommitHash();
    }
    return "";
  }

  public async findAllPartials(): Promise<Result<Record<string, string>>> {
    if (this.foundPartials) {
      return { data: this.foundPartials };
    }
    const partials: Record<string, string> = {};
    if (this.absolutePartialsDir) {
      try {
        const entries = await glob(`**/*`, {
          cwd: this.absolutePartialsDir,
          dot: false,
          nodir: true,
        });
        for (const entry of entries) {
          const key = entry.split(".")[0]!;
          const value = path.join(this.absolutePartialsDir, entry);
          partials[key] = value;
        }
      } catch (error) {
        logError({
          error,
          shortMessage: `Failed to read partials directory at ${this.absolutePartialsDir}`,
        });
        return {
          error: `Failed to read partials directory at ${this.absolutePartialsDir}: ${error}`,
        };
      }
    }

    if (this.parentTemplate) {
      const parentPartialsResult = await this.parentTemplate.findAllPartials();
      if ("error" in parentPartialsResult) {
        return parentPartialsResult;
      }
      for (const [key, value] of Object.entries(parentPartialsResult.data)) {
        if (!partials[key]) {
          partials[key] = value;
        }
      }
    }
    this.foundPartials = partials;
    return { data: partials };
  }

  public async isValid(): Promise<boolean> {
    const gitService = getGitService();
    const devTemplatesEnabled = process.env.SKAFF_DEV_TEMPLATES
      ?.toLowerCase()
      .trim();
    const skipCleanCheck =
      devTemplatesEnabled === "1" ||
      devTemplatesEnabled === "true" ||
      devTemplatesEnabled === "yes" ||
      devTemplatesEnabled === "on";

    if (!skipCleanCheck) {
      const isRepoClean = await gitService.isGitRepoClean(
        this.absoluteBaseDir,
      );
      if ("error" in isRepoClean) {
        return false;
      }
      if (!isRepoClean.data) {
        return false;
      }
    }

    const commitResult = await gitService.getCommitHash(this.absoluteBaseDir);
    if ("error" in commitResult) {
      return false;
    }

    const foundCommitHash = this.findCommitHash();

    return commitResult.data === foundCommitHash;
  }

}
