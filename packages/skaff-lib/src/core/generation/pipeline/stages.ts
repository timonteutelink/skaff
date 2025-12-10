import type {
  FinalTemplateSettings,
  ProjectSettings,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import fs from "fs-extra";

import { backendLogger } from "../../../lib/logger";
import { anyOrCallbackToAny } from "../../../lib/utils";
import { isSubset } from "../../../utils/shared-utils";
import type { Template } from "../../models/template";
import { TemplateGenerationPipeline } from "./generation-pipeline";
import type { FileMaterializer } from "./../FileMaterializer";
import type { GenerationContext } from "./../GenerationContext";
import type { PathResolver } from "./../PathResolver";
import type { ProjectSettingsSynchronizer } from "./../ProjectSettingsSynchronizer";
import type { SideEffectExecutor } from "./../SideEffectExecutor";
import type { AutoInstantiationPlanner } from "./../AutoInstantiationPlanner";
import type { GitService } from "../../infra/git-service";
import { makeDir } from "../../infra/file-service";
import type { GeneratorOptions } from "../template-generator-service";
import type { TemplateGenerationStage } from "./generation-pipeline";

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
  stages: TemplateGenerationStage<TemplateInstantiationPipelineContext>[],
): TemplateGenerationPipeline<TemplateInstantiationPipelineContext> =>
  new TemplateGenerationPipeline<TemplateInstantiationPipelineContext>(stages);

export const createProjectCreationPipeline = (
  stages: TemplateGenerationStage<ProjectCreationPipelineContext>[],
): TemplateGenerationPipeline<ProjectCreationPipelineContext> =>
  new TemplateGenerationPipeline<ProjectCreationPipelineContext>(stages);

export class ContextSetupStage
  implements TemplateGenerationStage<TemplateInstantiationPipelineContext>
{
  public readonly name = "context-setup";

  constructor(
    private readonly generationContext: GenerationContext,
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

    this.generationContext.setCurrentState({
      template: context.template,
      finalSettings: result.data,
      parentInstanceId: context.parentInstanceId,
    });

    context.finalSettings = result.data;

    return { data: context };
  }
}

export class TemplateValidationStage
  implements TemplateGenerationStage<TemplateInstantiationPipelineContext>
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

export class RenderStage
  implements TemplateGenerationStage<TemplateInstantiationPipelineContext>
{
  public readonly name = "render";

  constructor(private readonly fileMaterializer: FileMaterializer) { }

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

export class SideEffectsStage
  implements TemplateGenerationStage<TemplateInstantiationPipelineContext>
{
  public readonly name = "side-effects";

  constructor(private readonly sideEffectExecutor: SideEffectExecutor) { }

  public async run(
    context: TemplateInstantiationPipelineContext,
  ): Promise<{ data: TemplateInstantiationPipelineContext } | { error: string }>
  {
    const sideEffectResult = await this.sideEffectExecutor.applySideEffects();
    if ("error" in sideEffectResult) {
      return sideEffectResult;
    }

    return { data: context };
  }
}

export class PersistTemplateSettingsStage
  implements TemplateGenerationStage<TemplateInstantiationPipelineContext>
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

export class AutoInstantiationStage
  implements TemplateGenerationStage<TemplateInstantiationPipelineContext>
{
  public readonly name = "auto-instantiation";

  constructor(private readonly autoInstantiationPlanner: AutoInstantiationPlanner) { }

  public async run(
    context: TemplateInstantiationPipelineContext,
  ): Promise<{ data: TemplateInstantiationPipelineContext } | { error: string }>
  {
    if (!context.finalSettings) {
      return { error: "Template final settings are missing." };
    }

    const templatesToAutoInstantiateResult =
      this.autoInstantiationPlanner.getTemplatesToAutoInstantiateForCurrentTemplate();

    if ("error" in templatesToAutoInstantiateResult) {
      return templatesToAutoInstantiateResult;
    }

    if (templatesToAutoInstantiateResult.data.length) {
      const autoInstantiationResult =
        await this.autoInstantiationPlanner.autoInstantiateSubTemplates(
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

export class TargetPathStage
  implements TemplateGenerationStage<TemplateInstantiationPipelineContext>
{
  public readonly name = "target-path";

  constructor(
    private readonly pathResolver: PathResolver,
    private readonly generationContext: GenerationContext,
  ) { }

  public async run(
    context: TemplateInstantiationPipelineContext,
  ): Promise<{ data: TemplateInstantiationPipelineContext } | { error: string }>
  {
    const targetPathResult = this.pathResolver.getAbsoluteTargetPath();

    if ("error" in targetPathResult) {
      return targetPathResult;
    }

    const finalSettingsResult = this.generationContext.getFinalSettings();

    if ("error" in finalSettingsResult) {
      return finalSettingsResult;
    }

    context.targetPath = targetPathResult.data;
    context.finalSettings = finalSettingsResult.data;

    return { data: context };
  }
}

export class ProjectSetupStage
  implements TemplateGenerationStage<ProjectCreationPipelineContext>
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

export class ProjectRenderingStage
  implements TemplateGenerationStage<ProjectCreationPipelineContext>
{
  public readonly name = "project-render";

  constructor(private readonly fileMaterializer: FileMaterializer) { }

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

export class ProjectSideEffectsStage
  implements TemplateGenerationStage<ProjectCreationPipelineContext>
{
  public readonly name = "project-side-effects";

  constructor(private readonly sideEffectExecutor: SideEffectExecutor) { }

  public async run(
    context: ProjectCreationPipelineContext,
  ): Promise<{ data: ProjectCreationPipelineContext } | { error: string }>
  {
    const sideEffectResult = await this.sideEffectExecutor.applySideEffects();
    if ("error" in sideEffectResult) {
      return sideEffectResult;
    }

    return { data: context };
  }
}

export class ProjectAutoInstantiationStage
  implements TemplateGenerationStage<ProjectCreationPipelineContext>
{
  public readonly name = "project-auto-instantiation";

  constructor(private readonly autoInstantiationPlanner: AutoInstantiationPlanner) { }

  public async run(
    context: ProjectCreationPipelineContext,
  ): Promise<{ data: ProjectCreationPipelineContext } | { error: string }>
  {
    if (!context.finalSettings) {
      return { error: "Template final settings are missing." };
    }

    const templatesToAutoInstantiateResult =
      this.autoInstantiationPlanner.getTemplatesToAutoInstantiateForCurrentTemplate();

    if ("error" in templatesToAutoInstantiateResult) {
      return templatesToAutoInstantiateResult;
    }

    if (templatesToAutoInstantiateResult.data.length) {
      const autoInstantiationResult =
        await this.autoInstantiationPlanner.autoInstantiateSubTemplates(
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
    generationContext: GenerationContext;
    projectSettingsSynchronizer: ProjectSettingsSynchronizer;
    fileMaterializer: FileMaterializer;
    sideEffectExecutor: SideEffectExecutor;
    autoInstantiationPlanner: AutoInstantiationPlanner;
    pathResolver: PathResolver;
  },
  options: GeneratorOptions,
  projectSettings: ProjectSettings,
): TemplateGenerationStage<TemplateInstantiationPipelineContext>[] => [
  new ContextSetupStage(
    dependencies.generationContext,
    dependencies.projectSettingsSynchronizer,
  ),
  new TemplateValidationStage(projectSettings),
  new RenderStage(dependencies.fileMaterializer),
  new SideEffectsStage(dependencies.sideEffectExecutor),
  new PersistTemplateSettingsStage(
    dependencies.projectSettingsSynchronizer,
    options,
  ),
  new AutoInstantiationStage(dependencies.autoInstantiationPlanner),
  new TargetPathStage(dependencies.pathResolver, dependencies.generationContext),
];

export const buildDefaultProjectCreationStages = (
  dependencies: {
    projectSettingsSynchronizer: ProjectSettingsSynchronizer;
    fileMaterializer: FileMaterializer;
    sideEffectExecutor: SideEffectExecutor;
    autoInstantiationPlanner: AutoInstantiationPlanner;
  },
  options: GeneratorOptions,
  gitService: GitService,
): TemplateGenerationStage<ProjectCreationPipelineContext>[] => [
  new ProjectSetupStage(options, gitService, dependencies.projectSettingsSynchronizer),
  new ProjectRenderingStage(dependencies.fileMaterializer),
  new ProjectSideEffectsStage(dependencies.sideEffectExecutor),
  new ProjectAutoInstantiationStage(dependencies.autoInstantiationPlanner),
];
