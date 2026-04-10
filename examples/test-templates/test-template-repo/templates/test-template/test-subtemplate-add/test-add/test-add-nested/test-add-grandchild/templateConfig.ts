import z from "zod";
import {
  TemplateConfig,
  TemplateConfigModule,
} from "@timonteutelink/template-types-lib";

const templateSettingsSchema = z.object({
  info: z
    .string()
    .default("Grandchild info")
    .describe("A note for the grandchild subtemplate"),
});

const templateFinalSettingsSchema = templateSettingsSchema;

const templateConfig: TemplateConfig = {
  name: "test_add_grandchild",
  description: "Grandchild subtemplate for add tests",
  author: "Timon Teutelink",
  specVersion: "1.0.0",
};

const templateConfigModule: TemplateConfigModule<{}, typeof templateSettingsSchema> = {
  templateConfig,
  targetPath: "./added/nested/grandchild",
  templateSettingsSchema,
  templateFinalSettingsSchema,
  mapFinalSettings: ({ templateSettings }) => ({
    ...templateSettings,
  }),
};

export default templateConfigModule;
