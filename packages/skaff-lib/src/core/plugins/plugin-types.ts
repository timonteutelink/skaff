import type { TemplatePluginConfig } from "@timonteutelink/template-types-lib";

import type {
  TemplateGenerationPlugin,
  TemplatePluginEntrypoint,
} from "../generation/template-generation-types";
import type { ProjectSettings } from "@timonteutelink/template-types-lib";
import type { TemplatePluginSettingsStore } from "./plugin-settings-store";
import type { Template } from "../templates/Template";
import type { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import type React from "react";

export interface PluginCommandHandlerContext {
  argv: string[];
  projectPath?: string;
  projectSettings: ProjectSettings;
  pluginSettings: TemplatePluginSettingsStore;
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
      pluginSettings: TemplatePluginSettingsStore;
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
  pluginSettings?: TemplatePluginSettingsStore;
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
  pluginSettings?: TemplatePluginSettingsStore;
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
  name?: string;
  template?: TemplatePluginEntrypoint;
  cli?: CliPluginEntrypoint;
  web?: WebPluginEntrypoint;
}

export interface LoadedTemplatePlugin {
  reference: NormalizedTemplatePluginConfig;
  module: SkaffPluginModule;
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
