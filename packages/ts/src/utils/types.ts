import { TemplateConfig } from "@timonteutelink/template-types-lib";
import z from "zod";

export type Result<T> = { data: T } | { error: string };

export interface TemplateDTO {
  dir: string;
  config: {
    templateConfig: TemplateConfig
    templateSettingsSchema: object;
  };
  templatesDir: string;
  subTemplates: Record<string, TemplateDTO[]>;
  refDir?: string;
}

export const ProjectSettingsSchema = z.object({
  projectName: z.string().min(1), //should match folder name
  projectAuthor: z.string().min(1),

  rootTemplateName: z.string().min(1),

  instantiatedTemplates: z.array(z.object({
    templateName: z.string().min(1),
    templateSettings: z.any() //UserTemplateSettings
  }))
});

export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

export interface ProjectDTO {
  name: string;
  absPath: string;
  rootTemplateName: string;

  settings: ProjectSettings;
}


