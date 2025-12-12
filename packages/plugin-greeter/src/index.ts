import type { TemplateGenerationPlugin } from "@timonteutelink/skaff-lib";
import {
  PipelineStage,
  TemplatePluginSettingsStore,
  TemplateInstantiationPipelineContext,
} from "@timonteutelink/skaff-lib";
import {
  GREETER_PLUGIN_NAME,
  type GreeterPluginOptions,
} from "@timonteutelink/skaff-plugin-greeter-types";

function createGreetingStage(
  pluginSettings: TemplatePluginSettingsStore,
  options?: GreeterPluginOptions,
  templateDescription?: string,
): PipelineStage<TemplateInstantiationPipelineContext> {
  const message =
    options?.greeting ??
    templateDescription ??
    "Hello from the greeter plugin!";

  return {
    name: "greeter-greeting",
    async run(context) {
      // eslint-disable-next-line no-console
      console.log(`👋 ${message}`);
      pluginSettings.updatePluginSettings(
        context.instantiatedTemplate.id,
        GREETER_PLUGIN_NAME,
        (previous) => ({
          ...(previous ?? {}),
          lastGreeting: new Date().toISOString(),
          message,
          audience: options?.audience ?? "developer",
        }),
        { defaultValue: {} },
      );
      return { data: context };
    },
  } satisfies PipelineStage<any>;
}

function createGreeterTemplatePlugin(
  options?: GreeterPluginOptions,
  templateDescription?: string,
): TemplateGenerationPlugin {
  return {
    configureTemplateInstantiationPipeline(builder, context) {
      builder.insertAfter(
        "context-setup",
        createGreetingStage(
          context.pluginSettingsStore,
          options,
          templateDescription,
        ),
      );
    },
  } satisfies TemplateGenerationPlugin;
}

const greeterPlugin = {
  name: GREETER_PLUGIN_NAME,
  template: ({ options, template }) =>
    createGreeterTemplatePlugin(
      options as GreeterPluginOptions | undefined,
      typeof template.config.templateConfig.description === "string"
        ? template.config.templateConfig.description
        : undefined,
    ),
};

export default greeterPlugin;
