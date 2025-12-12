import type {
  FinalTemplateSettings,
  ProjectSettings,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import fs from "fs-extra";

import { backendLogger } from "../../../lib/logger";
import { anyOrCallbackToAny } from "../../../lib/utils";
import { isSubset } from "../../../utils/shared-utils";
import type { Template } from "../../../models/template";
import { makeDir } from "../../infra/file-service";
import type { GitService } from "../../infra/git-service";
import type { GeneratorOptions } from "../template-generation-types";
import type { ProjectSettingsSynchronizer } from "../ProjectSettingsSynchronizer";
import type { AutoInstantiationCoordinator } from "./AutoInstantiationCoordinator";
import type { PipelineStage } from "./pipeline-runner";
import { PipelineRunner } from "./pipeline-runner";
import type { SideEffectCoordinator } from "./SideEffectCoordinator";
import type { TargetPathResolver } from "./TargetPathResolver";
import type { TemplateFileMaterializer } from "./TemplateFileMaterializer";
import type { TemplatePipelineContext } from "./TemplatePipelineContext";

export interface TemplateInstantiationPipelineContext {
  template: Template;
  parentInstanceId?: string;
  userSettings: UserTemplateSettings;
  projectSettings: ProjectSettings;
  instantiatedTemplate: ProjectSettings["instantiatedTemplates"][number];
  finalSettings?: FinalTemplateSettings;
  targetPath?: string;
  templateSettingsPersisted?: boolean;
}

export interface ProjectCreationPipelineContext {
  template: Template;
  userSettings: UserTemplateSettings;
  projectSettings: ProjectSettings;
  finalSettings?: FinalTemplateSettings;
  projectDirCreated?: boolean;
  projectSettingsPersisted?: boolean;
}

export const createTemplateInstantiationPipeline = (
  stages: PipelineStage<TemplateInstantiationPipelineContext>[],
): PipelineRunner<TemplateInstantiationPipelineContext> =>
  new PipelineRunner<TemplateInstantiationPipelineContext>(stages);

export const createProjectCreationPipeline = (
  stages: PipelineStage<ProjectCreationPipelineContext>[],
): PipelineRunner<ProjectCreationPipelineContext> =>
  new PipelineRunner<ProjectCreationPipelineContext>(stages);

/**
 * Initializes pipeline context with resolved template settings.
 *
 * This stage validates the template repository, resolves user settings into
 * final template settings, and stores them on the shared pipeline context so
 * downstream stages can render files and apply side effects with confidence.
 */
export class ContextSetupStage
  implements PipelineStage<TemplateInstantiationPipelineContext>
{
  public readonly name = "context-setup";

  constructor(
    private readonly pipelineContext: TemplatePipelineContext,
    private readonly projectSettingsSynchronizer: ProjectSettingsSynchronizer,
  ) { }

  public async run(
    context: TemplateInstantiationPipelineContext,
  ): Promise<{ data: TemplateInstantiationPipelineContext } | { error: string }>
  {
    if (!await context.template.isValid()) {
      backendLogger.error(
        `Template repo is not clean or template commit hash is not valid.`,
      );
      return {
        error: `Template repo is not clean or template commit hash is not valid.`,
      };
    }

    const result = this.projectSettingsSynchronizer.getFinalTemplateSettings(
      context.template,
      context.userSettings,
      context.parentInstanceId,
    );

    if ("error" in result) {
      return result;
    }

    this.pipelineContext.setCurrentState({
      template: context.template,
      finalSettings: result.data,
      parentInstanceId: context.parentInstanceId,
    });

    context.finalSettings = result.data;

    return { data: context };
  }
}

/**
 * Guards against incompatible template combinations and failing assertions.
 *
 * By stopping the pipeline early when a template conflicts with an already
 * instantiated one or fails custom assertions, the stage prevents wasted work
 * later in the pipeline.
 */
export class TemplateValidationStage
  implements PipelineStage<TemplateInstantiationPipelineContext>
{
  public readonly name = "template-validation";

  constructor(private readonly projectSettings: ProjectSettings) { }

  public async run(
    context: TemplateInstantiationPipelineContext,
  ): Promise<{ data: TemplateInstantiationPipelineContext } | { error: string }>
  {
    if (!context.finalSettings) {
      return { error: "Template final settings are missing." };
    }

    const templatesThatDisableThisTemplate = anyOrCallbackToAny(
      context.template.config.templatesThatDisableThis,
      context.finalSettings,
    );

    if ("error" in templatesThatDisableThisTemplate) {
      return templatesThatDisableThisTemplate;
    }

    for (const existingTemplate of this.projectSettings.instantiatedTemplates) {
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
          `Template ${context.template.config.templateConfig.name} cannot be instantiated because ${existingTemplate.templateName} is already instantiated.`,
        );
        return {
          error:
            `Template ${context.template.config.templateConfig.name} cannot be instantiated because ${existingTemplate.templateName} is already instantiated.`,
        };
      }
    }

    const assertions = anyOrCallbackToAny(
      context.template.config.assertions,
      context.finalSettings,
    );

    if ("error" in assertions) {
      return assertions;
    }

    if (assertions.data !== undefined && !assertions.data) {
      backendLogger.error(
        `Template ${context.template.config.templateConfig.name} failed assertions.`,
      );
      return {
        error:
          `Template ${context.template.config.templateConfig.name} failed assertions.`,
      };
    }

    return { data: context };
  }
}

/**
 * Copies and renders template files into the destination directory.
 *
 * Relies on the {@link TemplateFileMaterializer} to honor redirects,
 * overwrites, and Handlebars helpers/partials for the active template.
 */
export class RenderStage
  implements PipelineStage<TemplateInstantiationPipelineContext>
{
  public readonly name = "render";

  constructor(private readonly fileMaterializer: TemplateFileMaterializer) { }

  public async run(
    context: TemplateInstantiationPipelineContext,
  ): Promise<{ data: TemplateInstantiationPipelineContext } | { error: string }>
  {
    const copyResult = await this.fileMaterializer.copyTemplateDirectory();
    if ("error" in copyResult) {
      return copyResult;
    }

    return { data: context };
  }
}

/**
 * Executes template-defined side-effect functions after rendering.
 *
 * This stage allows templates to mutate generated files (for example updating
 * manifests) while still participating in rollback management.
 */
export class SideEffectsStage
  implements PipelineStage<TemplateInstantiationPipelineContext>
{
  public readonly name = "side-effects";

  constructor(private readonly sideEffectCoordinator: SideEffectCoordinator) { }

  public async run(
    context: TemplateInstantiationPipelineContext,
  ): Promise<{ data: TemplateInstantiationPipelineContext } | { error: string }>
  {
    const sideEffectResult = await this.sideEffectCoordinator.applySideEffects();
    if ("error" in sideEffectResult) {
      return sideEffectResult;
    }

    return { data: context };
  }
}

/**
 * Persists the template's resolved settings back to the project configuration.
 *
 * Running after rendering ensures the project settings reflect what was
 * actually generated, enabling reproducible updates and diffs.
 */
export class PersistTemplateSettingsStage
  implements PipelineStage<TemplateInstantiationPipelineContext>
{
  public readonly name = "persist-template-settings";

  constructor(
    private readonly projectSettingsSynchronizer: ProjectSettingsSynchronizer,
    private readonly options: GeneratorOptions,
  ) { }

  public async run(
    context: TemplateInstantiationPipelineContext,
  ): Promise<{ data: TemplateInstantiationPipelineContext } | { error: string }>
  {
    if (this.options.dontGenerateTemplateSettings) {
      return { data: context };
    }

    const newTemplateResult =
      await this.projectSettingsSynchronizer.persistNewTemplate(
        context.instantiatedTemplate,
      );

    if ("error" in newTemplateResult) {
      return newTemplateResult;
    }

    context.templateSettingsPersisted = true;

    return { data: context };
  }
}

/**
 * Triggers automatic instantiation of child templates declared by the current
 * template.
 *
 * Delegates to the {@link AutoInstantiationCoordinator} to hydrate project
 * settings and invoke nested pipeline runs when required.
 */
export class AutoInstantiationStage
  implements PipelineStage<TemplateInstantiationPipelineContext>
{
  public readonly name = "auto-instantiation";

  constructor(private readonly autoInstantiationCoordinator: AutoInstantiationCoordinator) { }

  public async run(
    context: TemplateInstantiationPipelineContext,
  ): Promise<{ data: TemplateInstantiationPipelineContext } | { error: string }>
  {
    if (!context.finalSettings) {
      return { error: "Template final settings are missing." };
    }

    const templatesToAutoInstantiateResult =
      this.autoInstantiationCoordinator.getTemplatesToAutoInstantiateForCurrentTemplate();

    if ("error" in templatesToAutoInstantiateResult) {
      return templatesToAutoInstantiateResult;
    }

    if (templatesToAutoInstantiateResult.data.length) {
      const autoInstantiationResult =
        await this.autoInstantiationCoordinator.autoInstantiateSubTemplates(
          context.finalSettings,
          context.instantiatedTemplate.id,
          templatesToAutoInstantiateResult.data,
        );

      if ("error" in autoInstantiationResult) {
        return autoInstantiationResult;
      }
    }

    return { data: context };
  }
}

/**
 * Resolves and stores the final target path for the rendered template.
 *
 * This stage must run after settings are finalized so that subsequent steps
 * (like git commits) know exactly where artifacts landed.
 */
export class TargetPathStage
  implements PipelineStage<TemplateInstantiationPipelineContext>
{
  public readonly name = "target-path";

  constructor(
    private readonly targetPathResolver: TargetPathResolver,
    private readonly pipelineContext: TemplatePipelineContext,
  ) { }

  public async run(
    context: TemplateInstantiationPipelineContext,
  ): Promise<{ data: TemplateInstantiationPipelineContext } | { error: string }>
  {
    const targetPathResult = this.targetPathResolver.getAbsoluteTargetPath();

    if ("error" in targetPathResult) {
      return targetPathResult;
    }

    const finalSettingsResult = this.pipelineContext.getFinalSettings();

    if ("error" in finalSettingsResult) {
      return finalSettingsResult;
    }

    context.targetPath = targetPathResult.data;
    context.finalSettings = finalSettingsResult.data;

    return { data: context };
  }
}

/**
 * Prepares the destination directory and initializes repository state.
 *
 * Ensures the project folder exists, initializes git (when enabled), and
 * persists a fresh project settings file before any rendering occurs.
 */
export class ProjectSetupStage
  implements PipelineStage<ProjectCreationPipelineContext>
{
  public readonly name = "project-setup";

  constructor(
    private readonly options: GeneratorOptions,
    private readonly gitService: GitService,
    private readonly projectSettingsSynchronizer: ProjectSettingsSynchronizer,
  ) { }

  public async run(
    context: ProjectCreationPipelineContext,
  ): Promise<{ data: ProjectCreationPipelineContext } | { error: string }>
  {
    const dirStat = await fs
      .stat(this.options.absoluteDestinationPath)
      .catch(() => null);
    if (dirStat && dirStat.isDirectory()) {
      backendLogger.error(
        `Directory ${this.options.absoluteDestinationPath} already exists.`,
      );
      return {
        error: `Directory ${this.options.absoluteDestinationPath} already exists.`,
      };
    }

    const ensureProjectDirResult = await makeDir(
      this.options.absoluteDestinationPath,
    );

    if ("error" in ensureProjectDirResult) {
      return ensureProjectDirResult;
    }

    let projectDirCreated = true;

    if (!this.options.dontDoGit) {
      const createRepoResult = await this.gitService.createGitRepo(
        this.options.absoluteDestinationPath,
      );
      if ("error" in createRepoResult) {
        return createRepoResult;
      }
    }

    let projectSettingsPersisted = false;
    if (!this.options.dontGenerateTemplateSettings) {
      const writeSettingsResult =
        await this.projectSettingsSynchronizer.persistNewProjectSettings();
      if ("error" in writeSettingsResult) {
        return writeSettingsResult;
      }
      projectSettingsPersisted = true;
    }

    if (!this.options.dontDoGit) {
      const commitResult = await this.gitService.commitAll(
        this.options.absoluteDestinationPath,
        `Initial commit for ${context.projectSettings.projectRepositoryName}`,
      );
      if ("error" in commitResult) {
        return commitResult;
      }
    }

    context.projectDirCreated = projectDirCreated;
    context.projectSettingsPersisted = projectSettingsPersisted;

    return { data: context };
  }
}

/**
 * Renders the root project template into the prepared directory.
 *
 * Uses the {@link TemplateFileMaterializer} so project creation follows the
 * same rendering rules as individual template instantiation.
 */
export class ProjectRenderingStage
  implements PipelineStage<ProjectCreationPipelineContext>
{
  public readonly name = "project-render";

  constructor(private readonly fileMaterializer: TemplateFileMaterializer) { }

  public async run(
    context: ProjectCreationPipelineContext,
  ): Promise<{ data: ProjectCreationPipelineContext } | { error: string }>
  {
    const copyResult = await this.fileMaterializer.copyTemplateDirectory();
    if ("error" in copyResult) {
      return copyResult;
    }

    return { data: context };
  }
}

/**
 * Runs project-level side effects after the main render.
 *
 * Allows templates to adjust files (e.g. installing dependencies) while
 * respecting rollback behaviour shared across the pipeline.
 */
export class ProjectSideEffectsStage
  implements PipelineStage<ProjectCreationPipelineContext>
{
  public readonly name = "project-side-effects";

  constructor(private readonly sideEffectCoordinator: SideEffectCoordinator) { }

  public async run(
    context: ProjectCreationPipelineContext,
  ): Promise<{ data: ProjectCreationPipelineContext } | { error: string }>
  {
    const sideEffectResult = await this.sideEffectCoordinator.applySideEffects();
    if ("error" in sideEffectResult) {
      return sideEffectResult;
    }

    return { data: context };
  }
}

/**
 * Autoinstantiates subtemplates immediately after the root project is created.
 *
 * This stage ensures nested templates are rendered with the same parent
 * context and settings that were produced during project creation.
 */
export class ProjectAutoInstantiationStage
  implements PipelineStage<ProjectCreationPipelineContext>
{
  public readonly name = "project-auto-instantiation";

  constructor(private readonly autoInstantiationCoordinator: AutoInstantiationCoordinator) { }

  public async run(
    context: ProjectCreationPipelineContext,
  ): Promise<{ data: ProjectCreationPipelineContext } | { error: string }>
  {
    if (!context.finalSettings) {
      return { error: "Template final settings are missing." };
    }

    const templatesToAutoInstantiateResult =
      this.autoInstantiationCoordinator.getTemplatesToAutoInstantiateForCurrentTemplate();

    if ("error" in templatesToAutoInstantiateResult) {
      return templatesToAutoInstantiateResult;
    }

    if (templatesToAutoInstantiateResult.data.length) {
      const autoInstantiationResult =
        await this.autoInstantiationCoordinator.autoInstantiateSubTemplates(
          context.finalSettings,
          context.projectSettings.instantiatedTemplates[0]?.id ?? "",
          templatesToAutoInstantiateResult.data,
        );

      if ("error" in autoInstantiationResult) {
        return autoInstantiationResult;
      }
    }

    return { data: context };
  }
}

export const buildDefaultTemplateInstantiationStages = (
  dependencies: {
    pipelineContext: TemplatePipelineContext;
    projectSettingsSynchronizer: ProjectSettingsSynchronizer;
    fileMaterializer: TemplateFileMaterializer;
    sideEffectCoordinator: SideEffectCoordinator;
    autoInstantiationCoordinator: AutoInstantiationCoordinator;
    targetPathResolver: TargetPathResolver;
  },
  options: GeneratorOptions,
  projectSettings: ProjectSettings,
): PipelineStage<TemplateInstantiationPipelineContext>[] => [
  new ContextSetupStage(
    dependencies.pipelineContext,
    dependencies.projectSettingsSynchronizer,
  ),
  new TemplateValidationStage(projectSettings),
  new RenderStage(dependencies.fileMaterializer),
  new SideEffectsStage(dependencies.sideEffectCoordinator),
  new PersistTemplateSettingsStage(
    dependencies.projectSettingsSynchronizer,
    options,
  ),
  new AutoInstantiationStage(dependencies.autoInstantiationCoordinator),
  new TargetPathStage(
    dependencies.targetPathResolver,
    dependencies.pipelineContext,
  ),
];

export const buildDefaultProjectCreationStages = (
  dependencies: {
    projectSettingsSynchronizer: ProjectSettingsSynchronizer;
    fileMaterializer: TemplateFileMaterializer;
    sideEffectCoordinator: SideEffectCoordinator;
    autoInstantiationCoordinator: AutoInstantiationCoordinator;
  },
  options: GeneratorOptions,
  gitService: GitService,
): PipelineStage<ProjectCreationPipelineContext>[] => [
  new ProjectSetupStage(options, gitService, dependencies.projectSettingsSynchronizer),
  new ProjectRenderingStage(dependencies.fileMaterializer),
  new ProjectSideEffectsStage(dependencies.sideEffectCoordinator),
  new ProjectAutoInstantiationStage(dependencies.autoInstantiationCoordinator),
];
