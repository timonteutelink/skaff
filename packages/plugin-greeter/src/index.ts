import type {
  TemplateGenerationPlugin,
  TemplatePluginFactoryInput,
} from "@timonteutelink/skaff-lib";
import {
  PipelineStage,
  TemplateInstantiationPipelineContext,
} from "@timonteutelink/skaff-lib";
import {
  GREETER_PLUGIN_NAME,
  type GreeterPluginOptions,
} from "@timonteutelink/skaff-plugin-greeter-types";
import {
  pluginAdditionalTemplateSettingsSchema,
  pluginFinalSettingsSchema,
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
    typeof input.template.config.templateConfig.description === "string"
      ? input.template.config.templateConfig.description
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
      additionalTemplateSettings: true,
      pluginFinalSettings: true,
    },
  },
  additionalTemplateSettingsSchema: pluginAdditionalTemplateSettingsSchema,
  pluginFinalSettingsSchema: pluginFinalSettingsSchema.merge(
    z.object({
      lastGreeting: z.string().optional(),
      message: z.string().optional(),
      audience: z.string().optional(),
    }),
  ),
  getFinalTemplateSettings: () => ({
    lastGreeting: new Date().toISOString(),
  }),
  template: createGreeterTemplatePlugin,
};

export default greeterPlugin;
