import type {
  ProjectCreationPipelineContext,
  TemplateInstantiationPipelineContext,
} from "./pipeline/pipeline-stages";
import { HelperDelegate } from "handlebars";
import type {
  PipelineBuilder,
  PipelineStage,
} from "./pipeline/pipeline-runner";
import type { TemplateView } from "../plugins/plugin-types";

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

/**
 * Context provided to template generation plugins.
 *
 * Plugins receive a minimal TemplateView instead of the full Template
 * to prevent access to sensitive filesystem paths and internal state.
 */
export interface TemplatePipelinePluginContext {
  options: GeneratorOptions;
  /** Read-only view of the root template with minimal safe information */
  rootTemplate: TemplateView;
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

/**
 * Input provided to template plugin factories.
 *
 * Plugins receive a minimal TemplateView instead of the full Template
 * to maintain security boundaries and prevent access to internal state.
 */
export interface TemplatePluginFactoryInput {
  /** Read-only view of the template with minimal safe information */
  template: TemplateView;
  /** Plugin-specific options from the template configuration */
  options?: unknown;
  /** Read-only project metadata */
  projectName: string;
  projectAuthor: string;
  rootTemplateName: string;
}

export type TemplateGenerationPluginFactory = (
  input: TemplatePluginFactoryInput,
) => TemplateGenerationPlugin;

export type TemplatePluginEntrypoint =
  | TemplateGenerationPlugin
  | TemplateGenerationPluginFactory;
