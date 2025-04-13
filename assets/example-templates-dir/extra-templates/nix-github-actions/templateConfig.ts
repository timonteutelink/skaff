import { z } from "zod";
import {
  TemplateConfig,
  TemplateConfigModule,
  TemplateSettingsType,
} from "@timonteutelink/template-types-lib";

const templateSettingsSchema = z.object({
  repo: z.string().optional(),
});

type FullTemplateSettings = TemplateSettingsType<typeof templateSettingsSchema>; // doesnt reference parent since will be referenced from multiple different templates

const templateConfig: TemplateConfig = {
  name: "nix_github_actions",
  description: "Github actions nix",
  author: "Timon Teutelink",
};

const templateConfigModule: TemplateConfigModule<
  FullTemplateSettings,
  typeof templateSettingsSchema
> = {
  templateConfig,
  targetPath: ".github/workflows/",
  templateSettingsSchema,
  sideEffects: [],
};

export default templateConfigModule;
