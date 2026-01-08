import z from "zod";
import {
  TemplateConfig,
  TemplateConfigModule,
} from "@timonteutelink/template-types-lib";
import type {
  ErdSchema,
  ErdTemplateMappers,
  ErdTemplateSettings,
} from "@timonteutelink/skaff-plugin-erd-types";

const templateSettingsSchema = z.record(z.string(), z.unknown());

const templateFinalSettingsSchema = z.object({
  erdJson: z.string(),
});

const mappers: ErdTemplateMappers = {
  toErd: (settings) => settings as ErdSchema,
  fromErd: (erd) => erd as ErdTemplateSettings,
};

const templateConfig: TemplateConfig = {
  name: "test_erd_json",
  description: "A subtemplate that outputs ERD JSON",
  author: "Timon Teutelink",
  specVersion: "1.0.0",
};

const templateConfigModule: TemplateConfigModule<
  {},
  typeof templateSettingsSchema,
  typeof templateFinalSettingsSchema
> = {
  templateConfig,
  targetPath: "./erd-json",
  templateSettingsSchema,
  templateFinalSettingsSchema,
  mapFinalSettings: ({ templateSettings }) => ({
    erdJson: JSON.stringify(templateSettings, null, 2),
  }),
  plugins: [
    {
      module: "@timonteutelink/skaff-plugin-erd",
      options: {
        mappers,
      },
    },
  ],
};

export default templateConfigModule;
