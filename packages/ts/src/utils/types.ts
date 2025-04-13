import { TemplateConfig } from "@timonteutelink/template-types-lib";
import z from "zod";

export type Result<T> = { data: T } | { error: string };

export interface TemplateDTO {
  dir: string;
  config: {
    templateConfig: TemplateConfig;
    templateSettingsSchema: object;
  };
  templatesDir: string;
  subTemplates: Record<string, TemplateDTO[]>;
  refDir?: string;
}

export const InstantiatedTemplateSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().optional(),

  templateName: z.string().min(1),
  templateSettings: z.any(), //UserTemplateSettings

  automaticallyInstantiatedByParent: z.boolean().optional(),
});

export type InstantiatedTemplate = z.infer<typeof InstantiatedTemplateSchema>;

export const ProjectSettingsSchema = z.object({
  projectName: z.string().min(1), //should match folder name
  projectAuthor: z.string().min(1),

  rootTemplateName: z.string().min(1),

  instantiatedTemplates: z.array(InstantiatedTemplateSchema),
});

export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

export interface ProjectDTO {
  name: string;
  absPath: string;
  rootTemplateName: string;

  settings: ProjectSettings;
}

export interface ParsedFile {
  path: string
  status: "added" | "modified" | "deleted"
  hunks: DiffHunk[]
}

export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}
