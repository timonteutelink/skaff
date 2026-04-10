import z from "zod";
import {
  TemplateConfig,
  TemplateConfigModule,
} from "@timonteutelink/template-types-lib";

const templateSettingsSchema = z.object({
  answer: z.string().default("21").describe("Whats 9 + 10?"),
});

const templateFinalSettingsSchema = z.object({
  markdown_answer: z.string(),
});

const templateConfig: TemplateConfig = {
  name: "test_stuff",
  description: "Testing stuff",
  author: "Timon Teutelink",
  specVersion: "1.0.0",
};

const templateConfigModule: TemplateConfigModule<
  {},
  typeof templateSettingsSchema,
  typeof templateFinalSettingsSchema
> = {
  templateConfig,
  targetPath: "./otherlocation",
  templateSettingsSchema,
  templateFinalSettingsSchema,
  mapFinalSettings: ({ templateSettings }) => ({
    markdown_answer: `The answer to 'Whats 9 + 10?' is **${templateSettings.answer}**`,
  }),
};

export default templateConfigModule;
