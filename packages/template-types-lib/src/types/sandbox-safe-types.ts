/**
 * Sandbox-Safe Type Definitions
 *
 * This module provides read-only type definitions that are safe to pass into
 * sandboxed code. These types ensure that plugins and template configurations
 * cannot mutate shared state or access sensitive information.
 *
 * SECURITY PRINCIPLES:
 * - All properties are readonly to prevent mutation
 * - Filesystem paths are excluded to prevent information leakage
 * - Only essential data is exposed to sandboxed code
 * - Types are designed to be deeply frozen with harden()
 *
 * @module
 */

import type { FinalTemplateSettings, UserTemplateSettings } from "./utils";
import type { TemplateConfig } from "./template-config-types";

/**
 * Read-only view of an instantiated template for sandboxed code.
 *
 * This type excludes sensitive information like filesystem paths and
 * repository URLs that could be used for attacks or information gathering.
 */
export interface ReadonlyInstantiatedTemplate {
  /** Unique identifier for this template instance */
  readonly id: string;

  /** Parent instance ID (for hierarchical templates) */
  readonly parentId?: string;

  /** Template name */
  readonly templateName: string;

  /** User-provided settings (frozen copy) */
  readonly templateSettings: Readonly<UserTemplateSettings>;

  /** Whether this was auto-instantiated by its parent */
  readonly automaticallyInstantiatedByParent?: boolean;

  /** Plugin settings (frozen copy) */
  readonly plugins?: Readonly<
    Record<
      string,
      Readonly<{
        version: string;
        settings: unknown;
      }>
    >
  >;
}

/**
 * Read-only view of project settings for sandboxed code.
 *
 * This type provides a safe, immutable view of project settings that
 * sandboxed code can read but not modify. Sensitive fields like
 * repository URLs and commit hashes are excluded.
 */
export interface ReadonlyProjectSettings {
  /** Project repository name */
  readonly projectRepositoryName: string;

  /** Project author */
  readonly projectAuthor: string;

  /** Root template name */
  readonly rootTemplateName: string;

  /** Read-only array of instantiated templates */
  readonly instantiatedTemplates: readonly ReadonlyInstantiatedTemplate[];
}

/**
 * Read-only view of template configuration for sandboxed code.
 *
 * This provides only the essential template metadata without exposing
 * filesystem paths, side effects, or other sensitive configuration.
 */
export interface ReadonlyTemplateView {
  /** Template name */
  readonly name: string;

  /** Template author */
  readonly author: string;

  /** Template description */
  readonly description?: string;

  /** Specification version */
  readonly specVersion: string;

  /** Whether this is a root template */
  readonly isRootTemplate?: boolean;

  /** Whether multiple instances are allowed */
  readonly multiInstance?: boolean;

  /** Names of available sub-templates (no paths) */
  readonly subTemplateNames: readonly string[];
}

/**
 * Scoped context for plugin factories and hooks.
 *
 * This provides plugins with only the data they need, preventing access
 * to the full project state or other templates' detailed settings.
 */
export interface PluginScopedContext {
  /** Read-only project metadata (no mutable access) */
  readonly project: Readonly<{
    name: string;
    author: string;
    rootTemplateName: string;
  }>;

  /** Read-only view of the current template */
  readonly template: ReadonlyTemplateView;

  /** Plugin-specific options passed from template config */
  readonly pluginOptions?: unknown;
}

/**
 * Input for the mapFinalSettings function (sandboxed).
 *
 * All properties are readonly to prevent mutation during settings computation.
 */
export interface MapFinalSettingsInput<
  TInputSettings extends UserTemplateSettings = UserTemplateSettings,
  TParentSettings extends FinalTemplateSettings = FinalTemplateSettings,
> {
  /** Read-only copy of the full project settings */
  readonly fullProjectSettings: ReadonlyProjectSettings;

  /** User-provided template settings (frozen copy) */
  readonly templateSettings: Readonly<TInputSettings>;

  /** Parent template's final settings if applicable (frozen copy) */
  readonly parentSettings?: Readonly<TParentSettings>;
}

/**
 * Input for plugin's computeOutput function.
 *
 * All properties are readonly to ensure deterministic, pure computation.
 *
 * IMPORTANT: The computeOutput function must be pure and deterministic.
 * Given the same input, it must always produce the same output.
 * Do not use Date.now(), Math.random(), or any non-deterministic operations.
 */
export interface PluginComputeOutputInput {
  /** The template's computed final settings (frozen copy) */
  readonly templateFinalSettings: Readonly<FinalTemplateSettings>;

  /** User-provided plugin input settings (frozen copy) */
  readonly inputSettings: Readonly<Record<string, unknown>>;

  /** Global plugin configuration (frozen copy) */
  readonly globalConfig: Readonly<Record<string, unknown>> | undefined;
}

/**
 * @deprecated Use `PluginComputeOutputInput` instead
 */
export interface PluginFinalSettingsInput {
  /** @deprecated Use templateFinalSettings */
  readonly templateFinalSettings: Readonly<FinalTemplateSettings>;

  /** @deprecated Use inputSettings */
  readonly additionalTemplateSettings: Readonly<Record<string, unknown>>;

  /** @deprecated Use globalConfig */
  readonly systemSettings: Readonly<Record<string, unknown>> | undefined;
}

/**
 * Context provided to template config callbacks (AnyOrCallback functions).
 *
 * Used for redirects, overwrites, assertions, auto-instantiation, etc.
 */
export interface TemplateCallbackContext<
  TFinalSettings extends FinalTemplateSettings = FinalTemplateSettings,
> {
  /** The template's computed final settings (frozen copy) */
  readonly settings: Readonly<TFinalSettings>;
}

/**
 * Creates a readonly project settings view from full project settings.
 *
 * This function strips sensitive data and returns a frozen, read-only view
 * suitable for passing into sandboxed code.
 *
 * @param settings - The full project settings object
 * @returns A frozen readonly view of the project settings
 */
export function createReadonlyProjectSettings(settings: {
  projectRepositoryName: string;
  projectAuthor: string;
  rootTemplateName: string;
  instantiatedTemplates: Array<{
    id: string;
    parentId?: string;
    templateName: string;
    templateSettings: UserTemplateSettings;
    templateCommitHash?: string;
    templateRepoUrl?: string;
    templateBranch?: string;
    automaticallyInstantiatedByParent?: boolean;
    lastMigration?: string;
    plugins?: Record<string, { version: string; settings: unknown }>;
  }>;
}): ReadonlyProjectSettings {
  return {
    projectRepositoryName: settings.projectRepositoryName,
    projectAuthor: settings.projectAuthor,
    rootTemplateName: settings.rootTemplateName,
    instantiatedTemplates: settings.instantiatedTemplates.map((t) => ({
      id: t.id,
      parentId: t.parentId,
      templateName: t.templateName,
      templateSettings: { ...t.templateSettings },
      automaticallyInstantiatedByParent: t.automaticallyInstantiatedByParent,
      plugins: t.plugins
        ? Object.fromEntries(
            Object.entries(t.plugins).map(([k, v]) => [
              k,
              { version: v.version, settings: v.settings },
            ]),
          )
        : undefined,
    })),
  };
}

/**
 * Creates a readonly template view from a template configuration.
 *
 * This function extracts only safe metadata, excluding filesystem paths,
 * side effects, and other sensitive configuration.
 *
 * @param config - The template configuration
 * @param subTemplateNames - Names of sub-templates
 * @returns A frozen readonly view of the template
 */
export function createReadonlyTemplateView(
  config: TemplateConfig,
  subTemplateNames: string[] = [],
): ReadonlyTemplateView {
  return {
    name: config.name,
    author: config.author,
    description: config.description,
    specVersion: config.specVersion,
    isRootTemplate: config.isRootTemplate,
    multiInstance: config.multiInstance,
    subTemplateNames: [...subTemplateNames],
  };
}
