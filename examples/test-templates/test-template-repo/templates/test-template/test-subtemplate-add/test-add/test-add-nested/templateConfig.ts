import z from "zod";
import {
  TemplateConfig,
  TemplateConfigModule,
} from "@timonteutelink/template-types-lib";

const templateSettingsSchema = z.object({
  detail: z
    .string()
    .default("Nested detail")
    .describe("A detail for the nested subtemplate"),
});

const templateFinalSettingsSchema = templateSettingsSchema;

const templateConfig: TemplateConfig = {
  name: "test_add_nested",
  description: "Nested subtemplate for add tests",
  author: "Timon Teutelink",
  specVersion: "1.0.0",
};

const templateConfigModule: TemplateConfigModule<{}, typeof templateSettingsSchema> = {
  templateConfig,
  targetPath: "./added/nested",
  templateSettingsSchema,
  templateFinalSettingsSchema,
  mapFinalSettings: ({ templateSettings }) => ({
    ...templateSettings,
  }),
};

export default templateConfigModule;
