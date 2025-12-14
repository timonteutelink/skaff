import { z } from "zod";

export const pluginSystemSettingsSchema = z.object({}).passthrough();

export const pluginAdditionalTemplateSettingsSchema = z
  .object({})
  .passthrough();

export const pluginFinalSettingsSchema = z.object({}).passthrough();

export type PluginSystemSettings = z.infer<typeof pluginSystemSettingsSchema>;
export type PluginAdditionalTemplateSettings = z.infer<
  typeof pluginAdditionalTemplateSettingsSchema
>;
export type PluginFinalSettings = z.infer<typeof pluginFinalSettingsSchema>;
