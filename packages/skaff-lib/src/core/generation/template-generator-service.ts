import {
  ProjectSettings,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import fs from "fs-extra";
import { backendLogger } from "../../lib/logger";
import { Result } from "../../lib/types";
import { anyOrCallbackToAny, logError } from "../../lib/utils";
import { AutoInstantiationPlanner } from "./AutoInstantiationPlanner";
import { FileMaterializer } from "./FileMaterializer";
import { GenerationContext } from "./GenerationContext";
import { PathResolver } from "./PathResolver";
import { ProjectSettingsSynchronizer } from "./ProjectSettingsSynchronizer";
import { RollbackFileSystem } from "./RollbackFileSystem";
import { SideEffectExecutor } from "./SideEffectExecutor";
import { HandlebarsEnvironment } from "../shared/HandlebarsEnvironment";
import { Template } from "../../models/template";
import { isSubset } from "../../utils/shared-utils";
import type { FileSystemService } from "../infra/file-service";
import { FileRollbackManager } from "../shared/FileRollbackManager";
import { getSkaffContainer } from "../../di/container";
import { inject, injectable } from "tsyringe";
import { FileSystemServiceToken, GitServiceToken, TemplateGeneratorServiceToken } from "../../di/tokens";
import type { GitService } from "../infra/git-service";

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

  constructor(
    private readonly options: GeneratorOptions,
    rootTemplate: Template,
    private readonly destinationProjectSettings: ProjectSettings,
    private readonly fileSystemService: FileSystemService,
    gitService: GitService,
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
  ): Promise<Result<string>> {
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

    let templateSettingsPersisted = false;
    const rollbackManager = new FileRollbackManager();

    const cleanupOnFailure = async () => {
      if (!removeOnFailure) {
        return;
      }

      const idsToRemove =
        this.projectSettingsSynchronizer.collectTemplateTreeIds(
          newTemplateInstanceId,
        );

      await this.projectSettingsSynchronizer.removeTemplatesFromProjectSettings(
        idsToRemove,
        { removeFromFile: templateSettingsPersisted },
      );
    };

    const fail = async <T>(result: Result<T>): Promise<Result<T>> =>
      this.failGeneration(rollbackManager, cleanupOnFailure, result);

    const failWithMessage = (message: string): Promise<Result<string>> =>
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

    const setContextResult = await this.setTemplateGenerationValues(
      userSettings,
      template,
      parentInstanceId,
    );

    if ("error" in setContextResult) {
      return fail(setContextResult);
    }

    const finalSettingsResult = this.generationContext.getFinalSettings();

    if ("error" in finalSettingsResult) {
      return fail(finalSettingsResult);
    }

    this.fileSystem.setRollbackManager(rollbackManager);

    const templatesThatDisableThisTemplate = anyOrCallbackToAny(
      template.config.templatesThatDisableThis,
      finalSettingsResult.data,
    );

    if ("error" in templatesThatDisableThisTemplate) {
      return fail(templatesThatDisableThisTemplate);
    }

    for (const existingTemplate of projectSettings.instantiatedTemplates) {
      if (
        templatesThatDisableThisTemplate.data
          ?.filter(
            (templateThatDisableThis) =>
              !templateThatDisableThis.specificSettings ||
              isSubset(
                templateThatDisableThis.specificSettings,
                existingTemplate.templateSettings,
              ),
          )
          .map(
            (templateThatDisableThis) =>
              templateThatDisableThis.templateName,
          )
          .includes(existingTemplate.templateName)
      ) {
        backendLogger.error(
          `Template ${templateName} cannot be instantiated because ${existingTemplate.templateName} is already instantiated.`,
        );
        return failWithMessage(
          `Template ${templateName} cannot be instantiated because ${existingTemplate.templateName} is already instantiated.`,
        );
      }
    }

    const assertions = anyOrCallbackToAny(
      template.config.assertions,
      finalSettingsResult.data,
    );

    if ("error" in assertions) {
      return fail(assertions);
    }

    if (assertions.data !== undefined && !assertions.data) {
      backendLogger.error(`Template ${templateName} failed assertions.`);
      return failWithMessage(`Template ${templateName} failed assertions.`);
    }

    try {
      const copyResult = await this.fileMaterializer.copyTemplateDirectory();
      if ("error" in copyResult) {
        return fail(copyResult);
      }

      const sideEffectResult = await this.sideEffectExecutor.applySideEffects();
      if ("error" in sideEffectResult) {
        return fail(sideEffectResult);
      }

      this.fileSystem.clearRollbackManager();

      if (!this.options.dontGenerateTemplateSettings) {
        const newTemplateResult =
          await this.projectSettingsSynchronizer.persistNewTemplate(
            instantiatedTemplate,
          );

        if ("error" in newTemplateResult) {
          return fail(newTemplateResult);
        }

        templateSettingsPersisted = true;
      }

      const templatesToAutoInstantiateResult =
        this.autoInstantiationPlanner.getTemplatesToAutoInstantiateForCurrentTemplate();

      if ("error" in templatesToAutoInstantiateResult) {
        return fail(templatesToAutoInstantiateResult);
      }

      if (templatesToAutoInstantiateResult.data.length) {
        const autoInstantiationResult =
          await this.autoInstantiationPlanner.autoInstantiateSubTemplates(
            finalSettingsResult.data,
            instantiatedTemplate.id,
            templatesToAutoInstantiateResult.data,
          );

        if ("error" in autoInstantiationResult) {
          return fail(autoInstantiationResult);
        }
      }
    } catch (error) {
      logError({
        shortMessage: `Failed to instantiate template`,
        error,
      });
      return fail({ error: `Failed to instantiate template: ${error}` });
    }

    const targetPathResult = this.pathResolver.getAbsoluteTargetPath();

    if ("error" in targetPathResult) {
      rollbackManager.clear();
      this.generationContext.clearCurrentState();
      return targetPathResult;
    }

    rollbackManager.clear();
    this.generationContext.clearCurrentState();

    return targetPathResult;
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

    let projectDirCreated = false;
    let projectSettingsPersisted = false;
    const rollbackManager = new FileRollbackManager();

    const cleanupOnFailure = async () => {
      const idsToRemove =
        this.projectSettingsSynchronizer.collectTemplateTreeIds(
          projectRootInstanceId,
        );
      await this.projectSettingsSynchronizer.removeTemplatesFromProjectSettings(
        idsToRemove,
        { removeFromFile: projectSettingsPersisted },
      );

      if (!projectDirCreated) {
        return;
      }

      try {
        await fs.rm(this.options.absoluteDestinationPath, {
          recursive: true,
          force: true,
        });
        projectDirCreated = false;
      } catch (error) {
        logError({
          shortMessage: `Failed to clean up project directory ${this.options.absoluteDestinationPath}`,
          error,
        });
      }
    };

    const fail = async <T>(result: Result<T>): Promise<Result<T>> =>
      this.failGeneration(rollbackManager, cleanupOnFailure, result);

    const dirStat = await fs
      .stat(this.options.absoluteDestinationPath)
      .catch(() => null);
    if (dirStat && dirStat.isDirectory()) {
      backendLogger.error(
        `Directory ${this.options.absoluteDestinationPath} already exists.`,
      );
      return fail({
        error: `Directory ${this.options.absoluteDestinationPath} already exists.`,
      });
    }

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

    try {
      const ensureProjectDirResult = await this.fileSystemService.makeDir(
        this.options.absoluteDestinationPath,
      );

      if ("error" in ensureProjectDirResult) {
        return fail(ensureProjectDirResult);
      }
      projectDirCreated = true;

      if (!this.options.dontDoGit) {
        const createRepoResult = await this.gitService.createGitRepo(
          this.options.absoluteDestinationPath,
        );
        if ("error" in createRepoResult) {
          return fail(createRepoResult);
        }
      }

      if (!this.options.dontGenerateTemplateSettings) {
        const writeSettingsResult =
          await this.projectSettingsSynchronizer.persistNewProjectSettings();
        if ("error" in writeSettingsResult) {
          return fail(writeSettingsResult);
        }
        projectSettingsPersisted = true;
      }

      if (!this.options.dontDoGit) {
        const commitResult = await this.gitService.commitAll(
          this.options.absoluteDestinationPath,
          `Initial commit for ${projectSettings.projectName}`,
        );
        if ("error" in commitResult) {
          return fail(commitResult);
        }
      }

      this.fileSystem.setRollbackManager(rollbackManager);
      const copyResult = await this.fileMaterializer.copyTemplateDirectory();
      if ("error" in copyResult) {
        return fail(copyResult);
      }

      const sideEffectResult = await this.sideEffectExecutor.applySideEffects();
      if ("error" in sideEffectResult) {
        return fail(sideEffectResult);
      }

      this.fileSystem.clearRollbackManager();

      const templatesToAutoInstantiateResult =
        this.autoInstantiationPlanner.getTemplatesToAutoInstantiateForCurrentTemplate();

      if ("error" in templatesToAutoInstantiateResult) {
        return fail(templatesToAutoInstantiateResult);
      }

      if (templatesToAutoInstantiateResult.data.length) {
        const autoInstantiationResult =
          await this.autoInstantiationPlanner.autoInstantiateSubTemplates(
            finalSettingsResult.data,
            instantiatedTemplate.id,
            templatesToAutoInstantiateResult.data,
          );

        if ("error" in autoInstantiationResult) {
          return fail(autoInstantiationResult);
        }
      }

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
    @inject(FileSystemServiceToken)
    private readonly fileSystemService: FileSystemService,
    @inject(GitServiceToken)
    private readonly gitService: GitService,
  ) {}

  public createSession(
    options: GeneratorOptions,
    rootTemplate: Template,
    destinationProjectSettings: ProjectSettings,
  ): TemplateGenerationSession {
    return new TemplateGenerationSession(
      options,
      rootTemplate,
      destinationProjectSettings,
      this.fileSystemService,
      this.gitService,
    );
  }
}

export function resolveTemplateGeneratorService(): TemplateGeneratorService {
  return getSkaffContainer().resolve(TemplateGeneratorServiceToken);
}
