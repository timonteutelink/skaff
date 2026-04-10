import {
  FinalTemplateSettings,
  ProjectSettings,
  UserTemplateSettings,
  createReadonlyProjectContext,
} from "@timonteutelink/template-types-lib";
import fs from "fs-extra";
import { backendLogger } from "../../lib/logger";
import { Result } from "../../lib/types";
import { anyOrCallbackToAny, logError } from "../../lib/utils";
import { getSkaffContainer } from "../../di/container";
import { TemplateGeneratorServiceToken } from "../../di/tokens";
import type { GitService } from "../infra/git-service";
import {
  GeneratorOptions,
  TemplateGenerationPipelineOverrides,
  TemplateGenerationPlugin,
  TemplatePipelinePluginContext,
} from "./template-generation-types";
import {
  buildDefaultProjectCreationStages,
  buildDefaultTemplateInstantiationStages,
  createProjectCreationPipeline,
  createTemplateInstantiationPipeline,
  ProjectCreationPipelineContext,
  TemplateInstantiationPipelineContext,
} from "./pipeline/pipeline-stages";
import {
  PipelineBuilder,
  PipelineRunner,
  PipelineStage,
} from "./pipeline/pipeline-runner";
import { AutoInstantiationCoordinator } from "./pipeline/AutoInstantiationCoordinator";
import { TemplateFileMaterializer } from "./pipeline/TemplateFileMaterializer";
import { TemplatePipelineContext } from "./pipeline/TemplatePipelineContext";
import { TargetPathResolver } from "./pipeline/TargetPathResolver";
import { ProjectSettingsSynchronizer } from "./ProjectSettingsSynchronizer";
import { RollbackFileSystem } from "./RollbackFileSystem";
import { SideEffectCoordinator } from "./pipeline/SideEffectCoordinator";
import { HandlebarsEnvironment } from "../shared/HandlebarsEnvironment";
import { Template } from "../../models/template";
import { FileRollbackManager } from "../shared/FileRollbackManager";
import {
  loadPluginsForTemplate,
  type LoadedTemplatePlugin,
  createTemplateView,
} from "../plugins";
import { createPluginLifecycleManager } from "../plugins/plugin-lifecycle";
import type { PluginGenerationResult } from "../plugins/plugin-types";
import { HelperDelegate } from "handlebars";

/**
 * Orchestrates template and project generation using the pipeline building blocks.
 *
 * The session wires together context tracking, path resolution, rendering,
 * side-effect execution, and auto-instantiation so callers can create new
 * projects or templates with a single entry point. Plugins can further adjust
 * the assembled pipelines to add or replace behaviour without duplicating the
 * orchestration logic.
 */
export class TemplateGenerationSession {
  private readonly pipelineContext: TemplatePipelineContext;
  private readonly targetPathResolver: TargetPathResolver;
  private readonly fileSystem: RollbackFileSystem;
  private readonly fileMaterializer: TemplateFileMaterializer;
  private readonly sideEffectCoordinator: SideEffectCoordinator;
  private readonly projectSettingsSynchronizer: ProjectSettingsSynchronizer;
  private readonly gitService: GitService;
  private readonly autoInstantiationCoordinator: AutoInstantiationCoordinator;
  private readonly rootTemplate: Template;
  private readonly templateInstantiationStages: PipelineStage<TemplateInstantiationPipelineContext>[];
  private readonly projectCreationStages: PipelineStage<ProjectCreationPipelineContext>[];
  private readonly pluginCache = new Map<string, LoadedTemplatePlugin[]>();
  private readonly additionalPlugins: TemplateGenerationPlugin[];
  private readonly pluginHandlebarHelpers: Record<string, HelperDelegate> = {};
  private readonly pluginContext: TemplatePipelinePluginContext;

  constructor(
    private readonly options: GeneratorOptions,
    rootTemplate: Template,
    private readonly destinationProjectSettings: ProjectSettings,
    gitService: GitService,
    pipelineOverrides?: TemplateGenerationPipelineOverrides,
    plugins?: TemplateGenerationPlugin[],
  ) {
    this.additionalPlugins = plugins ?? [];
    this.pipelineContext = new TemplatePipelineContext(rootTemplate);
    this.rootTemplate = this.pipelineContext.getRootTemplate();
    this.targetPathResolver = new TargetPathResolver(
      this.options.absoluteDestinationPath,
      this.pipelineContext,
    );
    this.fileSystem = new RollbackFileSystem();
    this.fileMaterializer = new TemplateFileMaterializer(
      this.pipelineContext,
      this.targetPathResolver,
      this.fileSystem,
      new HandlebarsEnvironment(),
      () => this.pluginHandlebarHelpers,
    );
    this.sideEffectCoordinator = new SideEffectCoordinator(
      this.pipelineContext,
      this.targetPathResolver,
      this.fileSystem,
    );
    this.projectSettingsSynchronizer = new ProjectSettingsSynchronizer(
      this.options,
      this.destinationProjectSettings,
      this.rootTemplate,
    );
    this.gitService = gitService;
    this.autoInstantiationCoordinator = new AutoInstantiationCoordinator(
      this.options,
      this.pipelineContext,
      this.projectSettingsSynchronizer,
      this.instantiateTemplateInProject.bind(this),
    );

    this.pluginContext = {
      options: this.options,
      rootTemplate: createTemplateView(this.rootTemplate),
      registerHandlebarHelpers: this.registerHandlebarHelpers.bind(this),
    };

    this.templateInstantiationStages =
      pipelineOverrides?.instantiateTemplateStages ??
      buildDefaultTemplateInstantiationStages(
        {
          pipelineContext: this.pipelineContext,
          projectSettingsSynchronizer: this.projectSettingsSynchronizer,
          fileMaterializer: this.fileMaterializer,
          sideEffectCoordinator: this.sideEffectCoordinator,
          autoInstantiationCoordinator: this.autoInstantiationCoordinator,
          targetPathResolver: this.targetPathResolver,
        },
        this.options,
        this.projectSettingsSynchronizer.getProjectSettings(),
      );

    this.projectCreationStages =
      pipelineOverrides?.projectCreationStages ??
      buildDefaultProjectCreationStages(
        {
          projectSettingsSynchronizer: this.projectSettingsSynchronizer,
          fileMaterializer: this.fileMaterializer,
          sideEffectCoordinator: this.sideEffectCoordinator,
          autoInstantiationCoordinator: this.autoInstantiationCoordinator,
        },
        this.options,
        this.gitService,
      );
  }

  private registerHandlebarHelpers(
    helpers: Record<string, HelperDelegate>,
  ): void {
    for (const [name, helper] of Object.entries(helpers)) {
      if (this.pluginHandlebarHelpers[name]) {
        throw new Error(
          `Handlebars helper ${name} has already been registered by another plugin.`,
        );
      }
      this.pluginHandlebarHelpers[name] = helper;
    }
  }

  private applyInstantiationPlugins(
    builder: PipelineBuilder<TemplateInstantiationPipelineContext>,
    plugins: TemplateGenerationPlugin[],
  ): void {
    for (const plugin of plugins) {
      plugin.configureTemplateInstantiationPipeline?.(
        builder,
        this.pluginContext,
      );
    }
  }

  private applyProjectCreationPlugins(
    builder: PipelineBuilder<ProjectCreationPipelineContext>,
    plugins: TemplateGenerationPlugin[],
  ): void {
    for (const plugin of plugins) {
      plugin.configureProjectCreationPipeline?.(builder, this.pluginContext);
    }
  }

  private logPipeline(
    kind: "template-instantiation" | "project-creation",
    stages: PipelineStage<any>[],
  ): void {
    const sequence = stages
      .map(
        (stage) =>
          `${stage.key}@${stage.phase ?? "run"}#${stage.priority ?? 0} (${stage.source ?? "unknown"})`,
      )
      .join(" -> ");
    backendLogger.info(`Composed ${kind} pipeline: ${sequence}`);
  }

  private createTemplateInstantiationPipeline(
    plugins: TemplateGenerationPlugin[],
  ): PipelineRunner<TemplateInstantiationPipelineContext> {
    const builder = new PipelineBuilder(this.templateInstantiationStages);
    this.applyInstantiationPlugins(builder, plugins);
    const stages = builder.build();
    this.logPipeline("template-instantiation", stages);
    return createTemplateInstantiationPipeline(stages);
  }

  private createProjectCreationPipeline(
    plugins: TemplateGenerationPlugin[],
  ): PipelineRunner<ProjectCreationPipelineContext> {
    const builder = new PipelineBuilder(this.projectCreationStages);
    this.applyProjectCreationPlugins(builder, plugins);
    const stages = builder.build();
    this.logPipeline("project-creation", stages);
    return createProjectCreationPipeline(stages);
  }

  private async loadTemplatePlugins(
    template: Template,
  ): Promise<Result<LoadedTemplatePlugin[]>> {
    const cached = this.pluginCache.get(template.absoluteDir);

    if (cached) {
      return { data: cached };
    }

    const loaded = await loadPluginsForTemplate(
      template,
      createReadonlyProjectContext(this.projectSettingsSynchronizer.getProjectSettings()),
    );

    if ("error" in loaded) {
      return loaded;
    }

    this.pluginCache.set(template.absoluteDir, loaded.data);
    return loaded;
  }

  private async loadGenerationPlugins(
    template: Template,
  ): Promise<Result<TemplateGenerationPlugin[]>> {
    const loaded = await this.loadTemplatePlugins(template);

    if ("error" in loaded) {
      return loaded;
    }

    const generationPlugins = loaded.data
      .map((entry) => entry.templatePlugin)
      .filter((plugin): plugin is TemplateGenerationPlugin => Boolean(plugin));

    return { data: [...generationPlugins, ...this.additionalPlugins] };
  }

  private async setTemplateGenerationValues(
    userSettings: UserTemplateSettings,
    template: Template,
    parentInstanceId?: string,
    options?: { templateInstanceId?: string },
  ): Promise<Result<LoadedTemplatePlugin[]>> {
    if (!(await template.isValid())) {
      backendLogger.error(
        `Template repo is not clean or template commit hash is not valid.`,
      );
      return {
        error: `Template repo is not clean or template commit hash is not valid.`,
      };
    }

    const pluginsResult = await this.loadTemplatePlugins(template);

    if ("error" in pluginsResult) {
      return pluginsResult;
    }

    const result = this.projectSettingsSynchronizer.getFinalTemplateSettings(
      template,
      userSettings,
      parentInstanceId,
      {
        templateInstanceId: options?.templateInstanceId,
      },
    );

    if ("error" in result) {
      return result;
    }

    this.pipelineContext.setCurrentState({
      template,
      finalSettings: result.data,
      parentInstanceId,
    });

    return { data: pluginsResult.data };
  }

  private async cleanupInstantiationFailure(
    rollbackManager: FileRollbackManager,
  ): Promise<void> {
    await rollbackManager.rollback();
    this.fileSystem.clearRollbackManager();
    this.pipelineContext.clearCurrentState();
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
  ): Promise<
    Result<{
      targetPath: string;
      finalSettings: FinalTemplateSettings;
    }>
  > {
    const removeOnFailure = options?.removeOnFailure ?? false;
    const projectSettings =
      this.projectSettingsSynchronizer.getProjectSettings();

    const instantiatedTemplateIndex =
      projectSettings.instantiatedTemplates.findIndex(
        (template: { id: string }) => template.id === newTemplateInstanceId,
      );

    if (instantiatedTemplateIndex === -1) {
      backendLogger.error(
        `Template with id ${newTemplateInstanceId} not found.`,
      );
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
    ): Promise<
      Result<{
        targetPath: string;
        finalSettings: FinalTemplateSettings;
      }>
    > => {
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
    ): Promise<
      Result<{
        targetPath: string;
        finalSettings: FinalTemplateSettings;
      }>
    > => fail({ error: message });

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

    const pluginLoadResult = await this.loadTemplatePlugins(template);

    if ("error" in pluginLoadResult) {
      return fail(pluginLoadResult);
    }

    const lifecycleManager = createPluginLifecycleManager(
      pluginLoadResult.data,
    );

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
      await lifecycleManager.invokeActivate(
        template.config.templateConfig.name,
        projectSettings.projectRepositoryName,
      );
      await lifecycleManager.invokeBeforeGenerate(
        template.config.templateConfig.name,
        projectSettings.projectRepositoryName,
      );

      const pluginsResult = await this.loadGenerationPlugins(template);

      if ("error" in pluginsResult) {
        return fail({ error: pluginsResult.error });
      }

      const pipeline = this.createTemplateInstantiationPipeline(
        pluginsResult.data,
      );

      this.fileSystem.setRollbackManager(rollbackManager);

      const pipelineResult = await pipeline.run(pipelineContext);

      if ("error" in pipelineResult) {
        return fail(pipelineResult);
      }

      this.fileSystem.clearRollbackManager();

      if (
        !pipelineResult.data.targetPath ||
        !pipelineResult.data.finalSettings
      ) {
        return fail({ error: "Template generation failed unexpectedly." });
      }

      rollbackManager.clear();
      this.pipelineContext.clearCurrentState();

      const lifecycleResult: PluginGenerationResult = {
        success: true,
      };
      await lifecycleManager.invokeAfterGenerate(
        lifecycleResult,
        template.config.templateConfig.name,
        projectSettings.projectRepositoryName,
      );

      return {
        data: {
          targetPath: pipelineResult.data.targetPath,
          finalSettings: pipelineResult.data.finalSettings,
        },
      };
    } catch (error) {
      const lifecycleResult: PluginGenerationResult = {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
      await lifecycleManager.invokeAfterGenerate(
        lifecycleResult,
        template.config.templateConfig.name,
        projectSettings.projectRepositoryName,
      );
      logError({
        shortMessage: `Failed to instantiate template`,
        error,
      });
      return fail({ error: `Failed to instantiate template: ${error}` });
    } finally {
      await lifecycleManager.invokeDeactivate();
    }
  }

  public async instantiateNewProject(): Promise<Result<string>> {
    const projectSettings =
      this.projectSettingsSynchronizer.getProjectSettings();
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

    const pluginLoadResult = await this.loadTemplatePlugins(template);

    if ("error" in pluginLoadResult) {
      return { error: pluginLoadResult.error };
    }

    const lifecycleManager = createPluginLifecycleManager(
      pluginLoadResult.data,
    );

    const setContextResult = await this.setTemplateGenerationValues(
      userSettings,
      template,
      undefined,
      {
        templateInstanceId: projectRootInstanceId,
      },
    );

    if ("error" in setContextResult) {
      return { error: setContextResult.error };
    }

    const finalSettingsResult = this.pipelineContext.getFinalSettings();

    if ("error" in finalSettingsResult) {
      return { error: "Failed to parse user settings." };
    }

    const assertions = anyOrCallbackToAny(
      template.config.assertions,
      finalSettingsResult.data,
    );

    if ("error" in assertions) {
      return { error: assertions.error };
    }

    if (assertions.data !== undefined && !assertions.data) {
      return {
        error: `Template ${template.config.templateConfig.name} failed assertions.`,
      };
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
      await lifecycleManager.invokeActivate(
        template.config.templateConfig.name,
        projectSettings.projectRepositoryName,
      );
      await lifecycleManager.invokeBeforeGenerate(
        template.config.templateConfig.name,
        projectSettings.projectRepositoryName,
      );

      const pluginsResult = await this.loadGenerationPlugins(template);

      if ("error" in pluginsResult) {
        return fail({ error: pluginsResult.error });
      }

      const pipeline = this.createProjectCreationPipeline(pluginsResult.data);

      this.fileSystem.setRollbackManager(rollbackManager);

      const pipelineResult = await pipeline.run(pipelineContext);

      if ("error" in pipelineResult) {
        return fail(pipelineResult);
      }

      this.fileSystem.clearRollbackManager();

      rollbackManager.clear();
      this.pipelineContext.clearCurrentState();

      const lifecycleResult: PluginGenerationResult = {
        success: true,
      };
      await lifecycleManager.invokeAfterGenerate(
        lifecycleResult,
        template.config.templateConfig.name,
        projectSettings.projectRepositoryName,
      );
    } catch (error) {
      await this.cleanupInstantiationFailure(rollbackManager);
      await cleanupOnFailure();
      const lifecycleResult: PluginGenerationResult = {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
      await lifecycleManager.invokeAfterGenerate(
        lifecycleResult,
        template.config.templateConfig.name,
        projectSettings.projectRepositoryName,
      );
      logError({
        shortMessage: `Failed to instantiate new project`,
        error,
      });
      return { error: `Failed to instantiate new project: ${error}` };
    } finally {
      await lifecycleManager.invokeDeactivate();
    }

    return { data: this.options.absoluteDestinationPath };
  }

  public async instantiateFullProjectFromSettings(): Promise<Result<string>> {
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
      const projectSettings =
        this.projectSettingsSynchronizer.getProjectSettings();
      if (
        this.rootTemplate.config.templateConfig.name !==
        projectSettings.rootTemplateName
      ) {
        backendLogger.error("Root template name mismatch in project settings.");
        return { error: "Root template name mismatch in project settings." };
      }

      if (projectSettings.instantiatedTemplates.length === 0) {
        backendLogger.error(
          "No instantiated templates found in project settings.",
        );
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

/**
 * DI-friendly entry point that spawns {@link TemplateGenerationSession}s.
 *
 * The service itself is thin: it provides git access from the container and
 * hands back a fully-wired session that drives the pipeline for a specific
 * template and destination.
 */
export class TemplateGeneratorService {
  constructor(private readonly gitService: GitService) {}

  public createSession(
    options: GeneratorOptions,
    rootTemplate: Template,
    destinationProjectSettings: ProjectSettings,
    pipelineOverrides?: TemplateGenerationPipelineOverrides,
    plugins?: TemplateGenerationPlugin[],
  ): TemplateGenerationSession {
    return new TemplateGenerationSession(
      options,
      rootTemplate,
      destinationProjectSettings,
      this.gitService,
      pipelineOverrides,
      plugins,
    );
  }
}

export function resolveTemplateGeneratorService(): TemplateGeneratorService {
  return getSkaffContainer().resolve(TemplateGeneratorServiceToken);
}
