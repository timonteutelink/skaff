import type {
  ComputeOutputInput,
  PipelineStage,
  PluginGenerationResult,
  PluginLifecycle,
  PluginLifecycleContext,
  TemplateGenerationPlugin,
  TemplateInstantiationPipelineContext,
  TemplatePluginFactoryInput,
} from "@timonteutelink/skaff-lib";
import {
  GREETER_PLUGIN_NAME,
  type GreeterPluginOptions,
} from "../../plugin-greeter-types/src/index";
import {
  pluginInputSchema,
  pluginOutputSchema,
} from "@timonteutelink/template-types-lib";
import z from "zod";

function createGreetingStage(
  options?: GreeterPluginOptions,
  templateDescription?: string,
): PipelineStage<TemplateInstantiationPipelineContext> {
  const message =
    options?.greeting ??
    templateDescription ??
    "Hello from the greeter plugin!";

  return {
    key: "greeter-greeting",
    name: "greeter-greeting",
    source: GREETER_PLUGIN_NAME,
    async run(context) {
      // eslint-disable-next-line no-console
      console.log(`👋 ${message}`);
      return { data: context };
    },
  } satisfies PipelineStage<any>;
}

function createGreeterTemplatePlugin(
  input: TemplatePluginFactoryInput,
): TemplateGenerationPlugin {
  const options = input.options as GreeterPluginOptions | undefined;
  const templateDescription =
    typeof input.template.config.description === "string"
      ? input.template.config.description
      : undefined;

  return {
    configureTemplateInstantiationPipeline(builder) {
      builder.insertAfter(
        "context-setup",
        createGreetingStage(options, templateDescription),
      );
    },
  } satisfies TemplateGenerationPlugin;
}

/**
 * Lifecycle hooks for the greeter plugin.
 * Demonstrates how plugins can respond to lifecycle events.
 */
const greeterLifecycle: PluginLifecycle = {
  onLoad(context: PluginLifecycleContext) {
    // eslint-disable-next-line no-console
    console.log(
      `[${context.pluginName}] Plugin loaded (v${context.pluginVersion})`,
    );
  },

  onActivate(context: PluginLifecycleContext) {
    // eslint-disable-next-line no-console
    console.log(
      `[${context.pluginName}] Activated for template: ${context.templateName ?? "unknown"}`,
    );
  },

  onBeforeGenerate(context: PluginLifecycleContext) {
    // eslint-disable-next-line no-console
    console.log(
      `[${context.pluginName}] Preparing to generate: ${context.projectName ?? "unknown project"}`,
    );
  },

  onAfterGenerate(
    context: PluginLifecycleContext,
    result: PluginGenerationResult,
  ) {
    if (result.success) {
      // eslint-disable-next-line no-console
      console.log(
        `[${context.pluginName}] Generation complete! Files: ${result.generatedFiles?.length ?? 0}`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[${context.pluginName}] Generation failed: ${result.error?.message ?? "unknown error"}`,
      );
    }
  },

  onDeactivate(context: PluginLifecycleContext) {
    // eslint-disable-next-line no-console
    console.log(`[${context.pluginName}] Deactivated. Goodbye!`);
  },

  onError(context) {
    // eslint-disable-next-line no-console
    console.error(
      `[${context.pluginName}] Error in ${context.phase}: ${context.error.message}`,
    );
  },
};

const greeterPlugin = {
  manifest: {
    name: GREETER_PLUGIN_NAME,
    version: "0.0.0",
    capabilities: ["template"],
    supportedHooks: {
      template: ["configureTemplateInstantiationPipeline"],
      cli: [],
      web: [],
    },
    schemas: {
      input: true,
      output: true,
    },
  },
  lifecycle: greeterLifecycle,
  inputSchema: pluginInputSchema,
  outputSchema: pluginOutputSchema.extend({
    message: z.string().optional(),
    audience: z.string().optional(),
  }),
  /**
   * Computes output settings from input.
   *
   * NOTE: This function must be deterministic. Avoid using Date.now(),
   * Math.random(), or any non-deterministic operations.
   */
  computeOutput: ({ inputSettings }: ComputeOutputInput) => ({
    message: (inputSettings as Record<string, unknown>).message ?? "Hello!",
    audience: (inputSettings as Record<string, unknown>).audience ?? "World",
  }),
  template: createGreeterTemplatePlugin,
};

export default greeterPlugin;
