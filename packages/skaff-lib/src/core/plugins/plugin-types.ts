import type { TemplatePluginConfig } from "@timonteutelink/template-types-lib";

import type {
  TemplateGenerationPlugin,
  TemplatePluginEntrypoint,
} from "../generation/template-generation-types";
import type {
  ProjectSettings,
  PluginSystemSettings,
  PluginAdditionalTemplateSettings,
  PluginFinalSettings,
} from "@timonteutelink/template-types-lib";
import type { Template } from "../templates/Template";
import type { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { z } from "zod";
import type React from "react";

export type PluginCapability = "template" | "cli" | "web";

export type TemplateHook =
  | "configureTemplateInstantiationPipeline"
  | "configureProjectCreationPipeline";

export const pluginManifestSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9-_.:@/]+$/, "Plugin names must be identifier-like."),
  version: z
    .string()
    .regex(/^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z-.]+)?$/, "Version must be semver."),
  capabilities: z
    .array(z.enum(["template", "cli", "web"]))
    .min(1),
  supportedHooks: z
    .object({
      template: z.array(z.enum(["configureTemplateInstantiationPipeline", "configureProjectCreationPipeline"]))
        .default([]),
      cli: z.array(z.string()).default([]),
      web: z.array(z.string()).default([]),
    })
    .default({ template: [], cli: [], web: [] }),
  schemas: z
    .object({
      systemSettings: z.boolean().optional(),
      additionalTemplateSettings: z.boolean().optional(),
      pluginFinalSettings: z.boolean().optional(),
    })
    .optional(),
  requiredSettingsKeys: z.array(z.string()).optional(),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export interface PluginCommandHandlerContext {
  argv: string[];
  projectPath?: string;
  projectSettings: ProjectSettings;
}

export interface PluginCliCommand {
  name: string;
  description?: string;
  run(context: PluginCommandHandlerContext): Promise<void> | void;
}

export interface CliPluginContribution {
  commands?: PluginCliCommand[];
  templateStages?: CliTemplateStage[];
}

export type CliPluginEntrypoint =
  | CliPluginContribution
  | (() => CliPluginContribution | Promise<CliPluginContribution>);

export interface WebPluginContribution {
  getNotices?(
    context: {
      projectSettings: ProjectSettings;
      rootTemplate?: Template;
    },
  ): Promise<string[]> | string[];
  templateStages?: WebTemplateStage[];
}

export type WebPluginEntrypoint =
  | WebPluginContribution
  | (() => WebPluginContribution | Promise<WebPluginContribution>);

export interface NormalizedTemplatePluginConfig {
  module: string;
  exportName?: string;
  options?: unknown;
}

export type TemplateStagePlacement = "before-settings" | "after-settings";

export interface WebTemplateStageContext {
  templateName: string;
  projectRepositoryName?: string;
  currentSettings?: UserTemplateSettings | null;
  stageState: unknown;
}

export interface WebTemplateStageRenderProps extends WebTemplateStageContext {
  onContinue: () => void;
  setStageState: (value: unknown) => void;
}

export interface WebTemplateStage {
  id: string;
  placement: TemplateStagePlacement;
  stateKey?: string;
  shouldSkip?: (
    context: WebTemplateStageContext,
  ) => boolean | Promise<boolean>;
  render: (props: WebTemplateStageRenderProps) => React.ReactNode;
}

export interface CliTemplateStageContext {
  templateName: string;
  rootTemplateName: string;
  projectSettings?: ProjectSettings;
  currentSettings?: UserTemplateSettings | null;
  stageState: unknown;
  setStageState: (value: unknown) => void;
}

export interface CliTemplateStage {
  id: string;
  placement: TemplateStagePlacement;
  stateKey?: string;
  shouldSkip?: (
    context: CliTemplateStageContext,
  ) => boolean | Promise<boolean>;
  run: (
    context: CliTemplateStageContext & {
      prompts: typeof import("@inquirer/prompts");
    },
  ) => Promise<UserTemplateSettings | void | undefined>;
}

export interface SkaffPluginModule {
  manifest: PluginManifest;
  /**
   * Optional plugin-scoped configuration schemas.
   */
  systemSettingsSchema?: z.ZodType<PluginSystemSettings>;
  additionalTemplateSettingsSchema?: z.ZodType<PluginAdditionalTemplateSettings>;
  pluginFinalSettingsSchema?: z.ZodType<PluginFinalSettings>;
  getFinalTemplateSettings?: (input: {
    templateFinalSettings: PluginFinalSettings;
    additionalTemplateSettings: PluginAdditionalTemplateSettings;
    systemSettings: PluginSystemSettings | undefined;
  }) => PluginFinalSettings;
  template?: TemplatePluginEntrypoint;
  cli?: CliPluginEntrypoint;
  web?: WebPluginEntrypoint;
}

export interface LoadedTemplatePlugin {
  reference: NormalizedTemplatePluginConfig;
  module: SkaffPluginModule;
  name: string;
  version: string;
  requiredSettingsKeys?: string[];
  systemSettings?: PluginSystemSettings;
  additionalTemplateSettingsSchema?: z.ZodType<PluginAdditionalTemplateSettings>;
  pluginFinalSettingsSchema?: z.ZodType<PluginFinalSettings>;
  getFinalTemplateSettings?: SkaffPluginModule["getFinalTemplateSettings"];
  templatePlugin?: TemplateGenerationPlugin;
  cliPlugin?: CliPluginContribution;
  webPlugin?: WebPluginContribution;
}

export function normalizeTemplatePlugins(
  plugins?: TemplatePluginConfig[] | null,
): NormalizedTemplatePluginConfig[] {
  if (!plugins?.length) return [];

  return plugins
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === "string") {
        return { module: entry } satisfies NormalizedTemplatePluginConfig;
      }
      if (typeof entry === "object" && "module" in entry && entry.module) {
        return {
          module: entry.module,
          exportName: entry.exportName,
          options: entry.options,
        } satisfies NormalizedTemplatePluginConfig;
      }
      return null;
    })
    .filter((value): value is NormalizedTemplatePluginConfig => Boolean(value));
}
