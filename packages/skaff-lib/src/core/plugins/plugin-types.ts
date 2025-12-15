import type {
  TemplateConfig,
  TemplatePluginConfig,
} from "@timonteutelink/template-types-lib";

import type {
  TemplateGenerationPlugin,
  TemplatePluginEntrypoint,
} from "../generation/template-generation-types";
import type {
  FinalTemplateSettings,
  PluginGlobalConfig,
} from "@timonteutelink/template-types-lib";
import type { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { z } from "zod";
import type React from "react";

export type PluginCapability = "template" | "cli" | "web";

/**
 * A minimal, read-only view of a template exposed to plugins.
 *
 * This interface provides only the information plugins need to operate,
 * intentionally hiding filesystem paths and internal implementation details
 * to maintain security and encapsulation boundaries.
 */
export interface TemplateView {
  /** The template's unique name identifier */
  readonly name: string;
  /** Human-readable description of the template */
  readonly description?: string;
  /** The template configuration (without sensitive internal fields) */
  readonly config: Readonly<TemplateConfig>;
  /** Names of available sub-templates */
  readonly subTemplateNames: readonly string[];
  /** Whether this template is a detached subtree root */
  readonly isDetachedSubtreeRoot: boolean;
  /** Current commit hash if available */
  readonly commitHash?: string;
  /** Whether the template is loaded from a local path (not from cache) */
  readonly isLocal: boolean;
}

export type TemplateHook =
  | "configureTemplateInstantiationPipeline"
  | "configureProjectCreationPipeline";

// =============================================================================
// Plugin Lifecycle
// =============================================================================

/**
 * Context provided to lifecycle hooks during plugin operations.
 */
export interface PluginLifecycleContext {
  /** The name of the plugin */
  pluginName: string;
  /** The version of the plugin */
  pluginVersion: string;
  /** The template being operated on (if available) */
  templateName?: string;
  /** The project name (if available) */
  projectName?: string;
}

/**
 * Context provided to error handlers.
 */
export interface PluginErrorContext extends PluginLifecycleContext {
  /** The error that occurred */
  error: Error;
  /** The lifecycle phase where the error occurred */
  phase: PluginLifecyclePhase;
}

/**
 * Result of a generation operation provided to lifecycle hooks.
 */
export interface PluginGenerationResult {
  /** Whether the generation was successful */
  success: boolean;
  /** The generated files (paths relative to project root) */
  generatedFiles?: string[];
  /** Any warnings that occurred during generation */
  warnings?: string[];
  /** The error if generation failed */
  error?: Error;
}

/**
 * Phases of the plugin lifecycle.
 */
export type PluginLifecyclePhase =
  | "load"
  | "activate"
  | "before-generate"
  | "after-generate"
  | "deactivate"
  | "error";

/**
 * Lifecycle hooks that plugins can implement.
 *
 * These hooks are called at specific points during plugin and generation operations,
 * allowing plugins to perform initialization, cleanup, and respond to events.
 *
 * @example
 * ```typescript
 * const myPlugin = {
 *   manifest: { ... },
 *   lifecycle: {
 *     onActivate: async (ctx) => {
 *       console.log(`Plugin ${ctx.pluginName} activated`);
 *     },
 *     onBeforeGenerate: async (ctx) => {
 *       // Validate preconditions before generation
 *     },
 *     onAfterGenerate: async (ctx, result) => {
 *       if (result.success) {
 *         console.log(`Generated ${result.generatedFiles?.length ?? 0} files`);
 *       }
 *     },
 *     onError: (ctx) => {
 *       console.error(`Error in ${ctx.phase}: ${ctx.error.message}`);
 *     },
 *   },
 * };
 * ```
 */
export interface PluginLifecycle {
  /**
   * Called when the plugin is first loaded and its module is resolved.
   * Use this for one-time initialization that doesn't depend on project context.
   *
   * This is called once per plugin load, before any other hooks.
   */
  onLoad?(context: PluginLifecycleContext): Promise<void> | void;

  /**
   * Called when the plugin is activated for a specific template/project.
   * Use this for context-specific initialization, resource allocation,
   * or to validate that the plugin can operate in the current environment.
   *
   * This is called after onLoad and before any generation operations.
   */
  onActivate?(context: PluginLifecycleContext): Promise<void> | void;

  /**
   * Called before template generation begins.
   * Use this to validate preconditions, prepare resources, or log diagnostics.
   *
   * If this hook throws, generation is aborted and onError is called.
   */
  onBeforeGenerate?(context: PluginLifecycleContext): Promise<void> | void;

  /**
   * Called after template generation completes (whether successful or not).
   * Use this for cleanup, logging, or post-processing.
   *
   * The result contains information about what was generated or what failed.
   */
  onAfterGenerate?(
    context: PluginLifecycleContext,
    result: PluginGenerationResult,
  ): Promise<void> | void;

  /**
   * Called when the plugin is being deactivated.
   * Use this to release resources, close connections, or perform cleanup.
   *
   * This is called when the plugin is unloaded or the process is shutting down.
   */
  onDeactivate?(context: PluginLifecycleContext): Promise<void> | void;

  /**
   * Called when an error occurs during any lifecycle phase.
   * Use this for error logging, reporting, or recovery.
   *
   * Note: This hook should not throw. If it does, the error is logged but not propagated.
   */
  onError?(context: PluginErrorContext): void;
}

export const pluginManifestSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9-_.:@/]+$/, "Plugin names must be identifier-like."),
  version: z
    .string()
    .regex(
      /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z-.]+)?$/,
      "Version must be semver.",
    ),
  capabilities: z.array(z.enum(["template", "cli", "web"])).min(1),
  supportedHooks: z
    .object({
      template: z
        .array(
          z.enum([
            "configureTemplateInstantiationPipeline",
            "configureProjectCreationPipeline",
          ]),
        )
        .default([]),
      cli: z.array(z.string()).default([]),
      web: z.array(z.string()).default([]),
    })
    .default({ template: [], cli: [], web: [] }),
  /**
   * Declares which schemas the plugin exports.
   *
   * - `input`: Plugin accepts user-provided input settings (inputSchema)
   * - `output`: Plugin computes output settings (outputSchema)
   * - `globalConfig`: Plugin has global configuration (globalConfigSchema)
   */
  schemas: z
    .object({
      /** Plugin exports globalConfigSchema for system-wide configuration */
      globalConfig: z.boolean().optional(),
      /** Plugin exports inputSchema for user-provided settings */
      input: z.boolean().optional(),
      /** Plugin exports outputSchema for computed output */
      output: z.boolean().optional(),
    })
    .optional(),
  requiredSettingsKeys: z.array(z.string()).optional(),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export interface PluginCommandHandlerContext {
  /** Command-line arguments passed after the command name */
  argv: string[];
  /** Absolute path to the project directory, if available */
  projectPath?: string;
  /** Read-only project metadata */
  projectName: string;
  projectAuthor: string;
  rootTemplateName: string;
  /** Number of instantiated templates in the project */
  templateCount: number;
}

export interface PluginCliCommand {
  /**
   * Command name within the plugin's namespace.
   * The final command name will be prefixed with the plugin name: `pluginName:commandName`
   */
  name: string;
  /**
   * Optional short alias for the command.
   * If provided and unique across all plugins, users can invoke the command directly.
   * Aliases that collide with other commands or aliases are silently ignored.
   */
  alias?: string;
  description?: string;
  run(context: PluginCommandHandlerContext): Promise<void> | void;
}

/**
 * A resolved CLI command with its full namespaced name and optional alias.
 */
export interface ResolvedPluginCommand {
  /** The plugin that contributed this command */
  pluginName: string;
  /** The fully namespaced command name: `pluginName:commandName` */
  fullName: string;
  /** The short alias if available and unique, otherwise undefined */
  alias?: string;
  /** The original command definition */
  command: PluginCliCommand;
}

/**
 * Creates a fully namespaced command name.
 *
 * @param pluginName - The unique name of the plugin
 * @param commandName - The command name within the plugin
 * @returns A namespaced command name in the format `pluginName:commandName`
 */
export function createPluginCommandName(
  pluginName: string,
  commandName: string,
): string {
  return `${pluginName}:${commandName}`;
}

/**
 * Resolves plugin commands into a deduplicated list with collision detection.
 *
 * - All commands are namespaced with their plugin name to prevent collisions
 * - Aliases are only available if they don't collide with other aliases or full names
 * - Throws an error if two plugins register the same full command name
 *
 * @param plugins - The loaded plugins to resolve commands from
 * @returns An array of resolved commands with their full names and valid aliases
 * @throws Error if duplicate fully namespaced command names are detected
 */
export function resolvePluginCommands(
  plugins: { name: string; cliPlugin?: CliPluginContribution }[],
): ResolvedPluginCommand[] {
  const resolved: ResolvedPluginCommand[] = [];
  const fullNameSet = new Set<string>();
  const aliasCount = new Map<string, number>();

  // First pass: collect all commands and count alias usage
  for (const plugin of plugins) {
    const pluginName = plugin.name;
    const commands = plugin.cliPlugin?.commands ?? [];

    for (const command of commands) {
      const fullName = createPluginCommandName(pluginName, command.name);

      if (fullNameSet.has(fullName)) {
        throw new Error(
          `Duplicate plugin command detected: "${fullName}". ` +
            `Each plugin command must have a unique name within its namespace.`,
        );
      }

      fullNameSet.add(fullName);

      // Count alias usage for collision detection
      if (command.alias) {
        aliasCount.set(command.alias, (aliasCount.get(command.alias) ?? 0) + 1);
      }

      resolved.push({
        pluginName,
        fullName,
        alias: command.alias,
        command,
      });
    }
  }

  // Second pass: invalidate aliases that collide with full names or other aliases
  for (const entry of resolved) {
    if (entry.alias) {
      const count = aliasCount.get(entry.alias) ?? 0;
      const collidesWithFullName = fullNameSet.has(entry.alias);

      if (count > 1 || collidesWithFullName) {
        // Alias is not unique, remove it
        entry.alias = undefined;
      }
    }
  }

  return resolved;
}

/**
 * Finds a command by name, checking both full names and aliases.
 *
 * @param commands - The resolved commands to search
 * @param name - The command name to find (can be full name or alias)
 * @returns The matching command entry, or undefined if not found
 */
export function findPluginCommand(
  commands: ResolvedPluginCommand[],
  name: string,
): ResolvedPluginCommand | undefined {
  return commands.find(
    (entry) => entry.fullName === name || entry.alias === name,
  );
}

export interface CliPluginContribution {
  commands?: PluginCliCommand[];
  templateStages?: CliTemplateStage[];
}

export type CliPluginEntrypoint =
  | CliPluginContribution
  | (() => CliPluginContribution | Promise<CliPluginContribution>);

export interface WebPluginContribution {
  getNotices?(context: {
    projectName: string;
    projectAuthor: string;
    rootTemplateName: string;
    templateCount: number;
    rootTemplate?: TemplateView;
  }): Promise<string[]> | string[];
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

/**
 * Placement phases for plugin template stages.
 *
 * Stages run in the following order:
 * 1. `init` - Initialization, before any user interaction
 * 2. `before-settings` - After init, before the settings form is shown
 * 3. `after-settings` - After settings are submitted, before generation
 * 4. `finalize` - After generation is complete
 */
export type TemplateStagePlacement =
  | "init"
  | "before-settings"
  | "after-settings"
  | "finalize";

/**
 * Order in which template stage placements are executed.
 */
export const TEMPLATE_STAGE_PLACEMENT_ORDER: readonly TemplateStagePlacement[] =
  ["init", "before-settings", "after-settings", "finalize"] as const;

/**
 * Base context available to all template stages.
 * State is automatically namespaced by plugin to prevent collisions.
 */
export interface BaseTemplateStageContext<TState = unknown> {
  /** Name of the template being instantiated */
  templateName: string;
  /** Name of the project repository */
  projectRepositoryName?: string;
  /** Current user-provided settings (null before settings form) */
  currentSettings?: UserTemplateSettings | null;
  /**
   * Plugin-scoped state for this stage.
   * Automatically namespaced - plugins cannot see or modify other plugins' state.
   */
  stageState: TState;
}

export interface WebTemplateStageContext<
  TState = unknown,
> extends BaseTemplateStageContext<TState> {}

export interface WebTemplateStageRenderProps<
  TState = unknown,
> extends WebTemplateStageContext<TState> {
  /** Call this to proceed to the next stage */
  onContinue: () => void;
  /**
   * Update the stage state.
   * State is automatically namespaced by plugin name to prevent collisions.
   */
  setStageState: (value: TState) => void;
}

/**
 * A web UI stage contributed by a plugin.
 *
 * Stage state is automatically namespaced using the plugin name,
 * preventing collisions between plugins.
 */
export interface WebTemplateStage<TState = unknown> {
  /** Unique identifier for this stage within the plugin */
  id: string;
  /** When this stage should run in the template instantiation flow */
  placement: TemplateStagePlacement;
  /**
   * Optional Zod schema for validating stage state.
   * If provided, state will be validated before being passed to the stage.
   */
  stateSchema?: z.ZodType<TState>;
  /** Return true to skip this stage */
  shouldSkip?: (
    context: WebTemplateStageContext<TState>,
  ) => boolean | Promise<boolean>;
  /** Render the stage UI */
  render: (props: WebTemplateStageRenderProps<TState>) => React.ReactNode;
}

export interface CliTemplateStageContext<
  TState = unknown,
> extends BaseTemplateStageContext<TState> {
  /** Root template name */
  rootTemplateName: string;
  /**
   * Update the stage state.
   * State is automatically namespaced by plugin name to prevent collisions.
   */
  setStageState: (value: TState) => void;
}

/**
 * A CLI stage contributed by a plugin.
 *
 * Stage state is automatically namespaced using the plugin name,
 * preventing collisions between plugins.
 */
export interface CliTemplateStage<TState = unknown> {
  /** Unique identifier for this stage within the plugin */
  id: string;
  /** When this stage should run in the template instantiation flow */
  placement: TemplateStagePlacement;
  /**
   * Optional Zod schema for validating stage state.
   * If provided, state will be validated before being passed to the stage.
   */
  stateSchema?: z.ZodType<TState>;
  /** Return true to skip this stage */
  shouldSkip?: (
    context: CliTemplateStageContext<TState>,
  ) => boolean | Promise<boolean>;
  /** Execute the stage logic */
  run: (
    context: CliTemplateStageContext<TState> & {
      prompts: typeof import("@inquirer/prompts");
    },
  ) => Promise<UserTemplateSettings | void | undefined>;
}

/**
 * Input for the computeOutput function.
 *
 * All properties are readonly to ensure deterministic, pure computation.
 *
 * BIJECTIONAL GENERATION: The templateFinalSettings does NOT include a
 * `.plugins` field. This prevents plugins from reading other plugins'
 * input or output, ensuring each plugin's computation is independent
 * and deterministic.
 *
 * IMPORTANT: The computeOutput function must be pure and deterministic.
 * Given the same input, it must always produce the same output.
 * Do not use Date.now(), Math.random(), or any non-deterministic operations.
 */
export interface ComputeOutputInput {
  /**
   * The template's computed final settings (frozen copy).
   * Does NOT include `.plugins` - only pure template settings.
   */
  readonly templateFinalSettings: Readonly<FinalTemplateSettings>;

  /** User-provided plugin input settings (frozen copy) */
  readonly inputSettings: Readonly<Record<string, unknown>>;

  /** Global plugin configuration (frozen copy) */
  readonly globalConfig: Readonly<PluginGlobalConfig> | undefined;
}

/**
 * The main plugin module interface.
 *
 * This is what a plugin package must export as its default or named export.
 * It defines the plugin's manifest, schemas, and entrypoints.
 *
 * ## Schema Naming Convention
 *
 * Plugins use a clear input/output naming convention:
 *
 * - **globalConfigSchema**: System-wide configuration (e.g., API keys, endpoints)
 * - **inputSchema**: User-provided settings for a specific template instance
 * - **outputSchema**: Computed settings produced by the plugin (must be deterministic)
 *
 * The data flow is:
 * ```
 * globalConfig + inputSettings + templateFinalSettings
 *     → computeOutput()
 *     → outputSettings
 * ```
 *
 * @example
 * ```typescript
 * const myPlugin: SkaffPluginModule = {
 *   manifest: {
 *     name: "my-plugin",
 *     version: "1.0.0",
 *     capabilities: ["template"],
 *     schemas: { input: true, output: true },
 *   },
 *   inputSchema: z.object({
 *     greeting: z.string().optional(),
 *   }),
 *   outputSchema: z.object({
 *     computedGreeting: z.string(),
 *   }),
 *   computeOutput: ({ inputSettings, templateFinalSettings }) => ({
 *     computedGreeting: inputSettings.greeting ?? `Hello, ${templateFinalSettings.projectName}!`,
 *   }),
 *   template: (input) => ({ ... }),
 * };
 * ```
 */
export interface SkaffPluginModule {
  /** Plugin manifest with metadata and capability declarations */
  manifest: PluginManifest;

  /**
   * Optional lifecycle hooks for the plugin.
   * These are called at specific points during plugin and generation operations.
   */
  lifecycle?: PluginLifecycle;

  /**
   * Schema for global plugin configuration.
   *
   * Global configuration is system-wide settings that apply across all projects.
   * Typically stored in a config file or environment variables.
   *
   * Must be declared in manifest.schemas.globalConfig if exported.
   */
  globalConfigSchema?: z.ZodType<PluginGlobalConfig>;

  /**
   * Schema for user-provided input settings.
   *
   * Input settings are specified by users when instantiating a template.
   * These are the "knobs" users can tweak for plugin behavior.
   *
   * Must be declared in manifest.schemas.input if exported.
   */
  inputSchema?: z.ZodTypeAny;

  /**
   * Schema for computed output settings.
   *
   * Output settings are computed by the plugin from input settings and
   * template context. They are stored in the project settings for
   * reproducibility.
   *
   * Must be declared in manifest.schemas.output if exported.
   *
   * IMPORTANT: Output computation must be deterministic. The same
   * inputs must always produce the same outputs.
   */
  outputSchema?: z.ZodTypeAny;

  /**
   * Computes output settings from input settings and template context.
   *
   * This function MUST be pure and deterministic:
   * - Same inputs must always produce same outputs
   * - No side effects (no I/O, no mutations)
   * - No use of Date.now(), Math.random(), or other non-deterministic operations
   *
   * This function runs in a sandboxed environment.
   *
   * @param input - The input context with template settings, user input, and global config
   * @returns The computed output settings
   */
  computeOutput?: (input: ComputeOutputInput) => Record<string, unknown>;

  /** Template generation plugin entrypoint */
  template?: TemplatePluginEntrypoint;

  /** CLI contributions entrypoint */
  cli?: CliPluginEntrypoint;

  /** Web UI contributions entrypoint */
  web?: WebPluginEntrypoint;
}

/**
 * A fully loaded and validated plugin ready for use.
 *
 * Contains the resolved plugin module, schemas, and entrypoints.
 */
export interface LoadedTemplatePlugin {
  /** Original plugin reference configuration */
  reference: NormalizedTemplatePluginConfig;

  /** The loaded plugin module */
  module: SkaffPluginModule;

  /** Plugin name from manifest */
  name: string;

  /** Plugin version from manifest */
  version: string;

  /** Keys that must be present in user settings */
  requiredSettingsKeys?: string[];

  /** Resolved global configuration for this plugin */
  globalConfig?: PluginGlobalConfig;

  /** Schema for validating user-provided input settings */
  inputSchema?: z.ZodTypeAny;

  /** Schema for validating computed output settings */
  outputSchema?: z.ZodTypeAny;

  /** Function to compute output from input (must be deterministic) */
  computeOutput?: SkaffPluginModule["computeOutput"];

  /** Plugin lifecycle hooks */
  lifecycle?: PluginLifecycle;

  /** Template generation plugin (if template capability) */
  templatePlugin?: TemplateGenerationPlugin;

  /** CLI contributions (if cli capability) */
  cliPlugin?: CliPluginContribution;

  /** Web UI contributions (if web capability) */
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

/**
 * Creates a namespaced state key for a plugin stage.
 *
 * This ensures that each plugin's stage state is isolated from other plugins,
 * preventing accidental collisions even if plugins use the same stage IDs.
 *
 * @param pluginName - The unique name of the plugin
 * @param stageId - The stage identifier within the plugin
 * @returns A namespaced key in the format `pluginName::stageId`
 */
export function createPluginStageStateKey(
  pluginName: string,
  stageId: string,
): string {
  return `${pluginName}::${stageId}`;
}

/**
 * Parsed components of a namespaced state key.
 */
export interface ParsedStageStateKey {
  pluginName: string;
  stageId: string;
}

/**
 * Parses a namespaced state key back into its components.
 *
 * @param key - The namespaced key to parse
 * @returns The parsed components, or null if the key format is invalid
 */
export function parsePluginStageStateKey(
  key: string,
): ParsedStageStateKey | null {
  const separator = "::";
  const separatorIndex = key.indexOf(separator);
  if (separatorIndex === -1) {
    return null;
  }
  return {
    pluginName: key.slice(0, separatorIndex),
    stageId: key.slice(separatorIndex + separator.length),
  };
}

/**
 * Entry representing a loaded plugin stage with its source plugin information.
 */
export interface PluginStageEntry<TStage> {
  /** The plugin that contributed this stage */
  pluginName: string;
  /** The stage definition */
  stage: TStage;
  /** The namespaced state key for this stage */
  stateKey: string;
}

/**
 * Creates a PluginStageEntry with automatic state key namespacing.
 */
export function createPluginStageEntry<TStage extends { id: string }>(
  pluginName: string,
  stage: TStage,
): PluginStageEntry<TStage> {
  return {
    pluginName,
    stage,
    stateKey: createPluginStageStateKey(pluginName, stage.id),
  };
}
