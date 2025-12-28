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
 * Schema for plugin input settings.
 *
 * Input settings are user-provided values that configure plugin behavior
 * for a specific template instance. These are specified in the template's
 * settings when instantiating a project.
 *
 * Plugins should extend this schema to define what users can configure.
 *
 * @example
 * ```typescript
 * const myPluginInputSchema = pluginInputSchema.extend({
 *   enableFeatureX: z.boolean().default(false),
 *   greeting: z.string().optional(),
 * });
 * ```
 */
export const pluginInputSchema = z.object({}).strict();

/**
 * Schema for plugin output settings.
 *
 * Output settings are computed values produced by the plugin during template
 * generation. These are derived from input settings and template context,
 * and must be deterministic (same inputs always produce same outputs).
 *
 * IMPORTANT: Output computation must be pure and deterministic. Do not use
 * Date.now(), Math.random(), or any non-deterministic operations.
 *
 * Plugins should extend this schema to define their computed outputs.
 *
 * @example
 * ```typescript
 * const myPluginOutputSchema = pluginOutputSchema.extend({
 *   computedGreeting: z.string(),
 *   featureXEnabled: z.boolean(),
 * });
 * ```
 */
export const pluginOutputSchema = z.object({}).strict();

/**
 * Global configuration type for plugins.
 * Extends this type with your plugin's specific global config options.
 */
export type PluginGlobalConfig = z.infer<typeof pluginGlobalConfigSchema>;

/**
 * Input settings type for plugins.
 * Extends this type with your plugin's specific input options.
 */
export type PluginInputSettings = z.infer<typeof pluginInputSchema>;

/**
 * Output settings type for plugins.
 * Extends this type with your plugin's specific computed outputs.
 */
export type PluginOutputSettings = z.infer<typeof pluginOutputSchema>;
