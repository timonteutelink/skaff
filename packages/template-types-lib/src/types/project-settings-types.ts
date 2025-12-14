import { z } from "zod";

export const instantiatedTemplateSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().optional(),

  templateName: z.string().min(1),
  templateSettings: z.object({}).passthrough(), //UserTemplateSettings
  templateCommitHash: z.string().optional(), //TODO make sure this is a valid hash
  templateRepoUrl: z.string().optional(),
  templateBranch: z.string().optional(),

  automaticallyInstantiatedByParent: z.boolean().optional(),

  lastMigration: z.string().optional(),

  plugins: z
    .record(
      z.string(),
      z
        .object({
          version: z.string(),
          settings: z.unknown(),
        })
        .strict(),
    )
    .optional(),
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
