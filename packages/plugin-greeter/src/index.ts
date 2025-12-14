import type { TemplateGenerationPlugin } from "@timonteutelink/skaff-lib";
import { PipelineStage, TemplateInstantiationPipelineContext } from "@timonteutelink/skaff-lib";
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
    name: "greeter-greeting",
    async run(context) {
      // eslint-disable-next-line no-console
      console.log(`👋 ${message}`);
      return { data: context };
    },
  } satisfies PipelineStage<any>;
}

function createGreeterTemplatePlugin(
  options?: GreeterPluginOptions,
  templateDescription?: string,
): TemplateGenerationPlugin {
  return {
    configureTemplateInstantiationPipeline(builder) {
      builder.insertAfter(
        "context-setup",
        createGreetingStage(
          options,
          templateDescription,
        ),
      );
    },
  } satisfies TemplateGenerationPlugin;
}

const greeterPlugin = {
  name: GREETER_PLUGIN_NAME,
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
  template: ({ options, template }) =>
    createGreeterTemplatePlugin(
      options as GreeterPluginOptions | undefined,
      typeof template.config.templateConfig.description === "string"
        ? template.config.templateConfig.description
        : undefined,
    ),
};

export default greeterPlugin;
