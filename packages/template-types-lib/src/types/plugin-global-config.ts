import { z } from "zod";

/**
 * Schema for plugin global configuration.
 *
 * Global configuration is system-wide settings for a plugin that apply across
 * all projects and templates. These are typically stored in a config file or
 * environment variables.
 *
 * Plugins should extend this schema to add their own configuration options.
 *
 * @example
 * ```typescript
 * const myPluginGlobalConfigSchema = pluginGlobalConfigSchema.extend({
 *   apiKey: z.string().optional(),
 *   endpoint: z.string().url().optional(),
 * });
 * ```
 */
export const pluginGlobalConfigSchema = z.object({}).strict();

/**
 * Global configuration type for plugins.
 * Extends this type with your plugin's specific global config options.
 */
export type PluginGlobalConfig = z.infer<typeof pluginGlobalConfigSchema>;
