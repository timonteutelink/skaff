import {
  FinalTemplateSettings,
  ProjectSettings,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import fs from "fs-extra";
import { backendLogger } from "../../lib/logger";
import { Result } from "../../lib/types";
import { logError } from "../../lib/utils";
import { getSkaffContainer } from "../../di/container";
import { inject, injectable } from "tsyringe";
import { GitServiceToken, TemplateGeneratorServiceToken } from "../../di/tokens";
import type { GitService } from "../infra/git-service";
import {
  buildDefaultProjectCreationStages,
  buildDefaultTemplateInstantiationStages,
  createProjectCreationPipeline,
  createTemplateInstantiationPipeline,
  ProjectCreationPipelineContext,
  TemplateInstantiationPipelineContext,
} from "./pipeline/stages";
import { TemplateGenerationPipeline, TemplateGenerationStage } from "./pipeline/generation-pipeline";
import { AutoInstantiationPlanner } from "./AutoInstantiationPlanner";
import { FileMaterializer } from "./FileMaterializer";
import { GenerationContext } from "./GenerationContext";
import { PathResolver } from "./PathResolver";
import { ProjectSettingsSynchronizer } from "./ProjectSettingsSynchronizer";
import { RollbackFileSystem } from "./RollbackFileSystem";
import { SideEffectExecutor } from "./SideEffectExecutor";
import { HandlebarsEnvironment } from "../shared/HandlebarsEnvironment";
import { Template } from "../../models/template";
import { FileRollbackManager } from "../shared/FileRollbackManager";

export interface GeneratorOptions {
  /**
   * Don't add git.
   */
  dontDoGit?: boolean;

  /**
   * If true, the template generator will not generate the template settings file.
   * This mode allows subtemplates to be generated but will never save the template settings so after generation is complete all settings are lost.
   */
  dontGenerateTemplateSettings?: boolean;

  /**
   * If true do not auto instantiate child templates. Ignores this field.
   */
  dontAutoInstantiate?: boolean;

  /**
   * The absolute path to the destination directory where the template will be generated.
   * Should be the root project dir or the directory where the individual template should be stored.
   * This should be a valid path on the filesystem.
   */
  absoluteDestinationPath: string;
}

export interface TemplateGenerationPipelineOverrides {
  instantiateTemplateStages?: TemplateGenerationStage<TemplateInstantiationPipelineContext>[];
  projectCreationStages?: TemplateGenerationStage<ProjectCreationPipelineContext>[];
}

export class TemplateGenerationSession {
  private readonly generationContext: GenerationContext;
  private readonly pathResolver: PathResolver;
  private readonly fileSystem: RollbackFileSystem;
  private readonly fileMaterializer: FileMaterializer;
  private readonly sideEffectExecutor: SideEffectExecutor;
  private readonly projectSettingsSynchronizer: ProjectSettingsSynchronizer;
  private readonly gitService: GitService;
  private readonly autoInstantiationPlanner: AutoInstantiationPlanner;
  private readonly rootTemplate: Template;
  private readonly templateInstantiationPipeline: TemplateGenerationPipeline<TemplateInstantiationPipelineContext>;
  private readonly projectCreationPipeline: TemplateGenerationPipeline<ProjectCreationPipelineContext>;

  constructor(
    private readonly options: GeneratorOptions,
    rootTemplate: Template,
    private readonly destinationProjectSettings: ProjectSettings,
    gitService: GitService,
    pipelineOverrides?: TemplateGenerationPipelineOverrides,
  ) {
    this.generationContext = new GenerationContext(rootTemplate);
    this.rootTemplate = this.generationContext.getRootTemplate();
    this.pathResolver = new PathResolver(
      this.options.absoluteDestinationPath,
      this.generationContext,
    );
    this.fileSystem = new RollbackFileSystem();
    this.fileMaterializer = new FileMaterializer(
      this.generationContext,
      this.pathResolver,
      this.fileSystem,
      new HandlebarsEnvironment(),
    );
    this.sideEffectExecutor = new SideEffectExecutor(
      this.generationContext,
      this.pathResolver,
      this.fileSystem,
    );
    this.projectSettingsSynchronizer = new ProjectSettingsSynchronizer(
      this.options,
      this.destinationProjectSettings,
      this.rootTemplate,
    );
    this.gitService = gitService;
    this.autoInstantiationPlanner = new AutoInstantiationPlanner(
      this.options,
      this.generationContext,
      this.projectSettingsSynchronizer,
      this.instantiateTemplateInProject.bind(this),
    );

    const templateInstantiationStages =
      pipelineOverrides?.instantiateTemplateStages ??
      buildDefaultTemplateInstantiationStages(
        {
          generationContext: this.generationContext,
          projectSettingsSynchronizer: this.projectSettingsSynchronizer,
          fileMaterializer: this.fileMaterializer,
          sideEffectExecutor: this.sideEffectExecutor,
          autoInstantiationPlanner: this.autoInstantiationPlanner,
          pathResolver: this.pathResolver,
        },
        this.options,
        this.projectSettingsSynchronizer.getProjectSettings(),
      );

    this.templateInstantiationPipeline = createTemplateInstantiationPipeline(
      templateInstantiationStages,
    );

    const projectCreationStages =
      pipelineOverrides?.projectCreationStages ??
      buildDefaultProjectCreationStages(
        {
          projectSettingsSynchronizer: this.projectSettingsSynchronizer,
          fileMaterializer: this.fileMaterializer,
          sideEffectExecutor: this.sideEffectExecutor,
          autoInstantiationPlanner: this.autoInstantiationPlanner,
        },
        this.options,
        this.gitService,
      );

    this.projectCreationPipeline = createProjectCreationPipeline(
      projectCreationStages,
    );
  }

  private async setTemplateGenerationValues(
    userSettings: UserTemplateSettings,
    template: Template,
    parentInstanceId?: string,
  ): Promise<Result<void>> {
    if (!await template.isValid()) {
      backendLogger.error(
        `Template repo is not clean or template commit hash is not valid.`,
      );
      return {
        error: `Template repo is not clean or template commit hash is not valid.`,
      };
    }

    const result = this.projectSettingsSynchronizer.getFinalTemplateSettings(
      template,
      userSettings,
      parentInstanceId,
    );

    if ("error" in result) {
      return result;
    }

    this.generationContext.setCurrentState({
      template,
      finalSettings: result.data,
      parentInstanceId,
    });

    return { data: undefined };
  }

  private async cleanupInstantiationFailure(
    rollbackManager: FileRollbackManager,
  ): Promise<void> {
    await rollbackManager.rollback();
    this.fileSystem.clearRollbackManager();
    this.generationContext.clearCurrentState();
  }

  private async failGeneration<T>(
    rollbackManager: FileRollbackManager,
    cleanup: () => Promise<void>,
    result: Result<T>,
  ): Promise<Result<T>> {
    await this.cleanupInstantiationFailure(rollbackManager);
    await cleanup();
    return result;
  }

  public addNewProject(
    userSettings: UserTemplateSettings,
    newUuid?: string,
  ): Result<string> {
    return this.projectSettingsSynchronizer.addNewProject(
      userSettings,
      newUuid,
    );
  }

  public addNewTemplate(
    userSettings: UserTemplateSettings,
    templateName: string,
    parentInstanceId: string,
    autoInstantiated?: boolean,
    newUuid?: string,
  ): Result<string> {
    return this.projectSettingsSynchronizer.addNewTemplate(
      userSettings,
      templateName,
      parentInstanceId,
      autoInstantiated,
      newUuid,
    );
  }

  public async instantiateTemplateInProject(
    newTemplateInstanceId: string,
    options?: { removeOnFailure?: boolean },
  ): Promise<Result<{
    targetPath: string;
    finalSettings: FinalTemplateSettings;
  }>> {
    const removeOnFailure = options?.removeOnFailure ?? false;
    const projectSettings = this.projectSettingsSynchronizer.getProjectSettings();

    const instantiatedTemplateIndex =
      projectSettings.instantiatedTemplates.findIndex(
        (template) => template.id === newTemplateInstanceId,
      );

    if (instantiatedTemplateIndex === -1) {
      backendLogger.error(`Template with id ${newTemplateInstanceId} not found.`);
      return { error: `Template with id ${newTemplateInstanceId} not found.` };
    }

    const instantiatedTemplate =
      projectSettings.instantiatedTemplates[instantiatedTemplateIndex]!;

    const templateName = instantiatedTemplate.templateName;
    const userSettings = instantiatedTemplate.templateSettings;
    const parentInstanceId = instantiatedTemplate.parentId;
    const rollbackManager = new FileRollbackManager();
    let pipelineContext: TemplateInstantiationPipelineContext | null = null;

    const fail = async <T>(
      result: Result<T>,
    ): Promise<Result<{
      targetPath: string;
      finalSettings: FinalTemplateSettings;
    }>> => {
      const failure = await this.failGeneration(
        rollbackManager,
        cleanupOnFailure,
        result,
      );

      if ("error" in failure) {
        return { error: failure.error };
      }

      return {
        error: "Template generation failed unexpectedly.",
      };
    };

    const failWithMessage = (
      message: string,
    ): Promise<Result<{
      targetPath: string;
      finalSettings: FinalTemplateSettings;
    }>> =>
      fail({ error: message });

    if (!parentInstanceId) {
      backendLogger.error(
        `Parent instance ID is required for template ${templateName}. Maybe you are trying to instantiate the root template?`,
      );
      return failWithMessage(
        `Parent instance ID is required for template ${templateName}. Maybe you are trying to instantiate the root template?`,
      );
    }

    const template = this.rootTemplate.findSubTemplate(templateName);
    if (!template) {
      backendLogger.error(
        `Template ${templateName} could not be found in rootTemplate ${this.rootTemplate.config.templateConfig.name}`,
      );
      return failWithMessage(
        `Template ${templateName} could not be found in rootTemplate ${this.rootTemplate.config.templateConfig.name}`,
      );
    }

    pipelineContext = {
      template,
      parentInstanceId,
      userSettings,
      projectSettings,
      instantiatedTemplate,
    };

    const cleanupOnFailure = async () => {
      if (!removeOnFailure || !pipelineContext) {
        return;
      }

      const idsToRemove =
        this.projectSettingsSynchronizer.collectTemplateTreeIds(
          newTemplateInstanceId,
        );

      await this.projectSettingsSynchronizer.removeTemplatesFromProjectSettings(
        idsToRemove,
        { removeFromFile: pipelineContext.templateSettingsPersisted ?? false },
      );
    };

    if (!pipelineContext) {
      return fail({ error: "Template generation failed unexpectedly." });
    }

    try {
      this.fileSystem.setRollbackManager(rollbackManager);

      const pipelineResult = await this.templateInstantiationPipeline.run(
        pipelineContext,
      );

      if ("error" in pipelineResult) {
        return fail(pipelineResult);
      }

      this.fileSystem.clearRollbackManager();

      if (!pipelineResult.data.targetPath || !pipelineResult.data.finalSettings) {
        return fail({ error: "Template generation failed unexpectedly." });
      }

      rollbackManager.clear();
      this.generationContext.clearCurrentState();

      return {
        data: {
          targetPath: pipelineResult.data.targetPath,
          finalSettings: pipelineResult.data.finalSettings,
        },
      };
    } catch (error) {
      logError({
        shortMessage: `Failed to instantiate template`,
        error,
      });
      return fail({ error: `Failed to instantiate template: ${error}` });
    }
  }

  public async instantiateNewProject(): Promise<Result<string>> {
    const projectSettings = this.projectSettingsSynchronizer.getProjectSettings();
    const instantiatedTemplate = projectSettings.instantiatedTemplates[0];

    if (!instantiatedTemplate) {
      backendLogger.error(
        `Root template instance not found in project settings.`,
      );
      return {
        error: `Root template instance not found in project settings.`,
      };
    }

    const projectRootInstanceId = instantiatedTemplate.id;

    if (
      instantiatedTemplate.templateName !==
      this.rootTemplate.config.templateConfig.name
    ) {
      backendLogger.error(
        `Root template name mismatch in project settings. Make sure root template is the first one in the list.`,
      );
      const idsToRemove =
        this.projectSettingsSynchronizer.collectTemplateTreeIds(
          projectRootInstanceId,
        );
      await this.projectSettingsSynchronizer.removeTemplatesFromProjectSettings(
        idsToRemove,
      );
      return {
        error: `Root template name mismatch in project settings. Make sure root template is the first one in the list.`,
      };
    }

    const template = this.rootTemplate;
    const userSettings = instantiatedTemplate.templateSettings;
    const rollbackManager = new FileRollbackManager();

    const setContextResult = await this.setTemplateGenerationValues(
      userSettings,
      template,
    );

    if ("error" in setContextResult) {
      return fail(setContextResult);
    }

    const finalSettingsResult = this.generationContext.getFinalSettings();

    if ("error" in finalSettingsResult) {
      return fail({ error: "Failed to parse user settings." });
    }

    const pipelineContext: ProjectCreationPipelineContext = {
      template,
      userSettings,
      projectSettings,
      finalSettings: finalSettingsResult.data,
    };

    const cleanupOnFailure = async () => {
      const idsToRemove =
        this.projectSettingsSynchronizer.collectTemplateTreeIds(
          projectRootInstanceId,
        );
      await this.projectSettingsSynchronizer.removeTemplatesFromProjectSettings(
        idsToRemove,
        { removeFromFile: pipelineContext.projectSettingsPersisted ?? false },
      );

      if (!pipelineContext.projectDirCreated) {
        return;
      }

      try {
        await fs.rm(this.options.absoluteDestinationPath, {
          recursive: true,
          force: true,
        });
        pipelineContext.projectDirCreated = false;
      } catch (error) {
        logError({
          shortMessage: `Failed to clean up project directory ${this.options.absoluteDestinationPath}`,
          error,
        });
      }
    };

    const fail = async <T>(result: Result<T>): Promise<Result<T>> =>
      this.failGeneration(rollbackManager, cleanupOnFailure, result);

    try {
      this.fileSystem.setRollbackManager(rollbackManager);

      const pipelineResult = await this.projectCreationPipeline.run(
        pipelineContext,
      );

      if ("error" in pipelineResult) {
        return fail(pipelineResult);
      }

      this.fileSystem.clearRollbackManager();

      rollbackManager.clear();
      this.generationContext.clearCurrentState();
    } catch (error) {
      await this.cleanupInstantiationFailure(rollbackManager);
      await cleanupOnFailure();
      logError({
        shortMessage: `Failed to instantiate new project`,
        error,
      });
      return { error: `Failed to instantiate new project: ${error}` };
    }

    return { data: this.options.absoluteDestinationPath };
  }

  public async instantiateFullProjectFromSettings(): Promise<
    Result<string>
  > {
    if (!this.options.dontAutoInstantiate) {
      backendLogger.error(
        "Please make sure child templates are not autoinstantiated before generating a full project from existing settings.",
      );
      return {
        error:
          "Please make sure child templates are not autoinstantiated before generating a full project from existing settings.",
      };
    }

    try {
      const projectSettings = this.projectSettingsSynchronizer.getProjectSettings();
      if (
        this.rootTemplate.config.templateConfig.name !==
        projectSettings.rootTemplateName
      ) {
        backendLogger.error("Root template name mismatch in project settings.");
        return { error: "Root template name mismatch in project settings." };
      }

      if (projectSettings.instantiatedTemplates.length === 0) {
        backendLogger.error("No instantiated templates found in project settings.");
        return {
          error: "No instantiated templates found in project settings.",
        };
      }

      const projectGenerationResult = await this.instantiateNewProject();

      if ("error" in projectGenerationResult) {
        return projectGenerationResult;
      }

      for (const instantiated of projectSettings.instantiatedTemplates) {
        if (instantiated.id === projectSettings.instantiatedTemplates[0]!.id) {
          continue;
        }

        const subTemplate = this.rootTemplate.findSubTemplate(
          instantiated.templateName,
        );

        if (!subTemplate) {
          backendLogger.error(
            `Subtemplate ${instantiated.templateName} not found. Skipping...`,
          );
          continue;
        }

        const res = await this.instantiateTemplateInProject(instantiated.id);
        if ("error" in res) {
          return res;
        }
      }

      return { data: this.options.absoluteDestinationPath };
    } catch (error) {
      logError({
        shortMessage: `Failed to instantiate full project from settings`,
        error,
      });
      return {
        error: `Failed to instantiate full project from settings: ${error}`,
      };
    }
  }
}

@injectable()
export class TemplateGeneratorService {
  constructor(
    @inject(GitServiceToken)
    private readonly gitService: GitService,
  ) { }

  public createSession(
    options: GeneratorOptions,
    rootTemplate: Template,
    destinationProjectSettings: ProjectSettings,
    pipelineOverrides?: TemplateGenerationPipelineOverrides,
  ): TemplateGenerationSession {
    return new TemplateGenerationSession(
      options,
      rootTemplate,
      destinationProjectSettings,
      this.gitService,
      pipelineOverrides,
    );
  }
}

export function resolveTemplateGeneratorService(): TemplateGeneratorService {
  return getSkaffContainer().resolve(TemplateGeneratorServiceToken);
}
