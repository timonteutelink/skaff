import { z } from "zod";

/**
 * Schema for an instantiated template stored in templateSettings.json.
 *
 * IMPORTANT: Plugin settings are stored in `templateSettings.plugins` as user INPUT only.
 * Plugin output is always computed at runtime from the input to ensure bijectional generation.
 * This means the same templateSettings.json will always produce the exact same project output.
 *
 * The `templateSettings` field uses passthrough to allow plugin input to be stored as:
 * ```json
 * {
 *   "templateSettings": {
 *     "name": "my-project",
 *     "plugins": {
 *       "greeter": { "greeting": "Hello!" }
 *     }
 *   }
 * }
 * ```
 */
export const instantiatedTemplateSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().optional(),

  templateName: z.string().min(1),
  /**
   * User-provided template settings including plugin input.
   * Plugin input is stored under the `plugins` key as a record of plugin name to input settings.
   * Example: { name: "foo", plugins: { greeter: { greeting: "Hello!" } } }
   */
  templateSettings: z.object({}).passthrough(),
  templateCommitHash: z.string().optional(),
  templateRepoUrl: z.string().optional(),
  templateBranch: z.string().optional(),

  automaticallyInstantiatedByParent: z.boolean().optional(),

  lastMigration: z.string().optional(),
});

export type InstantiatedTemplate = z.infer<typeof instantiatedTemplateSchema>;

export const projectRepositoryNameRegex = /^[a-zA-Z0-9-_]+$/;

export const projectSettingsSchema = z.object({
  projectRepositoryName: z
    .string()
    .min(1)
    .regex(
      projectRepositoryNameRegex,
      "Project repository name can only contain letters, numbers, dashes and underscores.",
    ),
  projectAuthor: z.string().min(1),

  rootTemplateName: z.string().min(1),

  instantiatedTemplates: z.array(instantiatedTemplateSchema),
});

export type ProjectSettings = z.infer<typeof projectSettingsSchema>;
