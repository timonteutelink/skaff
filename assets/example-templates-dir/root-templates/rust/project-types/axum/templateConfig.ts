import { z } from "zod";
import {
  TemplateConfig,
  TemplateConfigModule,
  TemplateSettingsType,
} from "@timonteutelink/template-types-lib";
import { FullTemplateSettings as ParentTemplateSettings } from "./../../templateConfig";

const templateSettingsSchema = z.object({
  auth: z.boolean().optional(),
});

export type FullTemplateSettings = TemplateSettingsType<
  typeof templateSettingsSchema,
  ParentTemplateSettings
>;

const templateConfig: TemplateConfig = {
  name: "rust_axum",
  description: "Axum template",
  author: "Timon Teutelink",
};

const templateConfigModule: TemplateConfigModule<
  FullTemplateSettings,
  typeof templateSettingsSchema
> = {
  templateConfig,
  targetPath: "src",
  templateSettingsSchema,
  sideEffects: [],
  templatesThatDisableThis: ["rust_cli"]
};

export default templateConfigModule;
