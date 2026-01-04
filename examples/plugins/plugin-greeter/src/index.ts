import type {
  PipelineStage,
  PluginGenerationResult,
  PluginLifecycle,
  PluginLifecycleContext,
  SkaffPluginModule,
  TemplateGenerationPlugin,
  TemplateInstantiationPipelineContext,
  TemplatePluginEntrypoint,
} from "@timonteutelink/skaff-lib";
import {
  GREETER_PLUGIN_NAME,
  type GreeterPluginOptions,
} from "@timonteutelink/skaff-plugin-greeter-types";

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

const createGreeterTemplatePlugin: TemplatePluginEntrypoint = (input) => {
  const options = input.options as GreeterPluginOptions | undefined;
  const templateDescription =
    typeof input.template.description === "string"
      ? input.template.description
      : typeof input.template.config.description === "string"
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
};

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
      `[${context.pluginName}] Preparing to generate: ${context.projectRepositoryName ?? "unknown project"}`,
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

const greeterPlugin: SkaffPluginModule = {
  manifest: {
    name: GREETER_PLUGIN_NAME,
    version: "0.0.0",
    capabilities: ["template"],
    supportedHooks: {
      template: ["configureTemplateInstantiationPipeline"],
      cli: [],
      web: [],
    },
  },
  lifecycle: greeterLifecycle,
  template: createGreeterTemplatePlugin,
};

export default greeterPlugin;
