import z from "zod";
import {
  TemplateConfig,
  TemplateConfigModule,
} from "@timonteutelink/template-types-lib";

const templateSettingsSchema = z.object({
  note: z
    .string()
    .default("Added note")
    .describe("A note for the added subtemplate"),
});

const templateFinalSettingsSchema = templateSettingsSchema;

const templateConfig: TemplateConfig = {
  name: "test_add",
  description: "An added subtemplate with nested auto-instantiation",
  author: "Timon Teutelink",
  specVersion: "1.0.0",
};

const templateConfigModule: TemplateConfigModule<{}, typeof templateSettingsSchema> = {
  templateConfig,
  targetPath: "./added",
  templateSettingsSchema,
  templateFinalSettingsSchema,
  mapFinalSettings: ({ templateSettings }) => ({
    ...templateSettings,
  }),
  autoInstantiatedSubtemplates: [
    {
      subTemplateName: "test_add_nested",
      mapSettings: (finalSettings) => ({
        detail: `Nested: ${finalSettings.note}`,
      }),
      children: [
        {
          subTemplateName: "test_add_grandchild",
          mapSettings: (finalSettings) => ({
            info: `Grandchild: ${(finalSettings as { detail?: string }).detail ?? ""}`,
          }),
        },
      ],
    },
  ],
};

export default templateConfigModule;
