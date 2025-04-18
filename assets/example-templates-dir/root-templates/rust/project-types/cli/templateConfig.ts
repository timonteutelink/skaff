import { z } from "zod";
import {
  TemplateConfig,
  TemplateConfigModule,
  TemplateSettingsType,
} from "@timonteutelink/template-types-lib";
import { FullTemplateSettings as ParentTemplateSettings } from "./../../templateConfig";

const templateSettingsSchema = z.object({
  help: z.boolean().optional(),
});

export type FullTemplateSettings = TemplateSettingsType<
  typeof templateSettingsSchema,
  ParentTemplateSettings
>;

const templateConfig: TemplateConfig = {
  name: "rust_cli",
  description: "Rust CLI template",
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
  templatesThatDisableThis: ["rust_axum"],
};

export default templateConfigModule;
