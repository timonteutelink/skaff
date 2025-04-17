import { TemplateConfig } from "@timonteutelink/template-types-lib";
import z from "zod";

export interface ProjectCreationResult {
  newProject: ProjectDTO;
  diff: ParsedFile[];
}

export interface NewTemplateDiffResult {
  diffHash: string;
  parsedDiff: ParsedFile[];
}

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

// TODO: add the hash of the entire template when generated. This way if template changes we can ask the user if they want to bring the template up to date. Per template not per root template. Think about automatically updating also all children or choosing to update entire project at once.
export const InstantiatedTemplateSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().optional(),

  templateName: z.string().min(1),
  templateSettings: z.object({}).passthrough(), //UserTemplateSettings
  templateHash: z.string().min(64),

  automaticallyInstantiatedByParent: z.boolean().optional(),
});

export type InstantiatedTemplate = z.infer<typeof InstantiatedTemplateSchema>;

export const ProjectSettingsSchema = z.object({
  projectName: z.string().min(1), //should match folder name(not forced actually)
  projectAuthor: z.string().min(1),

  rootTemplateName: z.string().min(1),

  instantiatedTemplates: z.array(InstantiatedTemplateSchema),
});

export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

export interface GitStatus {
  isClean: boolean;
  currentBranch: string;
  branches: string[];
}

export interface ProjectDTO {
  name: string;
  absPath: string;
  rootTemplateName: string;

  gitStatus: GitStatus;

  settings: ProjectSettings;
}

export interface CreateProjectResult {
  resultPath: string;
  diff: string;
}

export interface ParsedFile {
  path: string;
  status: "added" | "modified" | "deleted";
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}
