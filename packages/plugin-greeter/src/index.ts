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
  options?: GreeterPluginOptions,
  templateDescription?: string,
): TemplateGenerationPlugin {
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
      message: z.string().optional(),
      audience: z.string().optional(),
    }),
  ),
  // NOTE: getFinalTemplateSettings removed - it was using non-deterministic
  // new Date().toISOString() which breaks the bijectional guarantee.
  // If plugins need timestamps, they should receive them from the host context.
  template: ({ options, template }: TemplatePluginFactoryInput) =>
    createGreeterTemplatePlugin(
      options as GreeterPluginOptions | undefined,
      // template is now ReadonlyTemplateView which has description directly
      typeof template.description === "string"
        ? template.description
        : undefined,
    ),
};

export default greeterPlugin;
