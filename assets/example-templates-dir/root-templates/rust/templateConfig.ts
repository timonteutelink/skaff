import { z } from "zod";
import {
  TemplateConfig,
  TemplateConfigModule,
  SideEffectFunction,
  TemplateSettingsType,
} from "@timonteutelink/template-types-lib";
// If after templating with handlebars a file contains { "TEMPLATE_FILE_REF": "../" } we can somehow include also that referenced file and template it. Then next to importing individual files from other locations we also allow importing templates with the provided settings. Even though this should use a subtemplate we should have also this way to automate instantiation of templates.

// fix all error handling, proper communication to frontend but also rollbacks when template generation fails. Use git in existing projects to enforce this and in new projects we can delete the project on error.

// Allow generating from existing templateSettings.json

const templateSettingsSchema = z.object({
  author: z.string().nonempty().min(2).max(100).describe('The author of the template').default('Timon Teutelink'),

  license: z.enum(["MIT", "Apache-2.0"]).optional(),
  coolStuff: z.boolean().optional(),
});

export type FullTemplateSettings = TemplateSettingsType<
  typeof templateSettingsSchema
>;

// can be done with a file in templates folder in this case just testing the sideeffects
const sideEffectFunction: SideEffectFunction<FullTemplateSettings> = async (
  templateSettings,
  oldFileContents,
) => {
  return `Project Name: ${""}\nAuthor: ${templateSettings.author || "Unknown"}`;
};

const templateConfig: TemplateConfig = {
  name: "rust",
  description: "Rust template",
  author: "Timon Teutelink",
};

// describe chat for user to have when generating template
// And also be able to describe a workflow using ai to generate a part of template automatically.
const templateConfigModule: TemplateConfigModule<
  FullTemplateSettings,
  typeof templateSettingsSchema
> = {
  templateConfig,
  targetPath: ".",
  templateSettingsSchema,
  sideEffects: (banana) => [
    {
      filePath: "./README.md",
      apply: sideEffectFunction,
    },
  ],
};

export default templateConfigModule;
