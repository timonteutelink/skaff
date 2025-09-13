import {
  FinalTemplateSettings,
  ProjectSettings,
  TemplateConfig,
  TemplateConfigModule,
  TemplateDisablingThis,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import z from "zod";

export type ProjectCreationOptions = {
  git?: boolean
};

export interface ProjectCreationResult {
  newProjectPath: string
  newProject: ProjectDTO;
  diff?: ParsedFile[];
}

export interface TemplateSummary {
  template: TemplateDTO;
  revisions: string[];
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
  currentCommitHash?: string; //always defined on root templates.
  isLocal: boolean;
  branch?: string;
  repoUrl?: string;
  templatesThatDisableThis: TemplateDisablingThis[];
  templateCommands: { title: string; description: string }[];
  refDir?: string;
}

export interface GitStatus {
  isClean: boolean;
  currentCommitHash: string;
  currentBranch: string;
  branches: string[];
}

export interface ProjectDTO {
  name: string;
  absPath: string;
  rootTemplateName: string;

  gitStatus?: GitStatus;

  settings: ProjectSettings;

  outdatedTemplate: boolean;
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

export type GenericTemplateConfigModule = TemplateConfigModule<FinalTemplateSettings, z.AnyZodObject, z.AnyZodObject, Record<string, string>, UserTemplateSettings, FinalTemplateSettings>;
