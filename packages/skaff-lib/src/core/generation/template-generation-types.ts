import { ProjectSettings } from "@timonteutelink/template-types-lib";

import type { Template } from "../templates/Template";
import type {
  ProjectCreationPipelineContext,
  TemplateInstantiationPipelineContext,
} from "./pipeline/pipeline-stages";
import { HelperDelegate } from "handlebars";
import type { PipelineBuilder, PipelineStage } from "./pipeline/pipeline-runner";

export interface GeneratorOptions {
  /**
   * Don't add git.
   */
  dontDoGit?: boolean;

  /**
   * If true, the template generator will not generate the template settings file.
   * This mode allows subtemplates to be generated but will never save the template settings so after generation is complete all
 settings are lost.
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
  instantiateTemplateStages?: PipelineStage<TemplateInstantiationPipelineContext>[];
  projectCreationStages?: PipelineStage<ProjectCreationPipelineContext>[];
}

export interface TemplatePipelinePluginContext {
  options: GeneratorOptions;
  rootTemplate: Template;
  registerHandlebarHelpers: (helpers: Record<string, HelperDelegate>) => void;
}

/**
 * Plug-in contract for customizing the template generation pipelines.
 *
 * Each hook receives a {@link PipelineBuilder} seeded with the default stages
 * and full access to the core pipeline dependencies so custom steps can be
 * injected or existing ones swapped out without forking the library.
 */
export interface TemplateGenerationPlugin {
  configureTemplateInstantiationPipeline?(
    builder: PipelineBuilder<TemplateInstantiationPipelineContext>,
    context: TemplatePipelinePluginContext,
  ): void;

  configureProjectCreationPipeline?(
    builder: PipelineBuilder<ProjectCreationPipelineContext>,
    context: TemplatePipelinePluginContext,
  ): void;
}

export type TemplateGenerationPluginFactory = (input: {
  template: Template;
  options?: unknown;
  projectSettings: ProjectSettings;
}) => TemplateGenerationPlugin;

export type TemplatePluginEntrypoint =
  | TemplateGenerationPlugin
  | TemplateGenerationPluginFactory;
