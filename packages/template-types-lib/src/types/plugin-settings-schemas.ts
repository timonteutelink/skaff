import { z } from "zod";

export const pluginSystemSettingsSchema = z.object({}).strict();

export const pluginAdditionalTemplateSettingsSchema = z
  .object({})
  .strict();

export const pluginFinalSettingsSchema = z.object({}).strict();

export type PluginSystemSettings = z.infer<typeof pluginSystemSettingsSchema>;
export type PluginAdditionalTemplateSettings = z.infer<
  typeof pluginAdditionalTemplateSettingsSchema
>;
export type PluginFinalSettings = z.infer<typeof pluginFinalSettingsSchema>;
