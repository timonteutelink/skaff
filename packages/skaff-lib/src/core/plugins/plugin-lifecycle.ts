import type {
  LoadedTemplatePlugin,
  PluginLifecycle,
  PluginLifecycleContext,
  PluginLifecyclePhase,
  PluginErrorContext,
  PluginGenerationResult,
} from "./plugin-types";

/**
 * Manages the lifecycle of loaded plugins.
 *
 * This class provides methods to invoke lifecycle hooks on plugins at appropriate times,
 * handling errors gracefully and ensuring consistent behavior across all plugins.
 */
export class PluginLifecycleManager {
  private readonly plugins: LoadedTemplatePlugin[];
  private readonly activatedPlugins: Set<string> = new Set();

  constructor(plugins: LoadedTemplatePlugin[]) {
    this.plugins = plugins;
  }

  /**
   * Creates a base lifecycle context for a plugin.
   */
  private createContext(
    plugin: LoadedTemplatePlugin,
    overrides?: Partial<PluginLifecycleContext>,
  ): PluginLifecycleContext {
    return {
      pluginName: plugin.name,
      pluginVersion: plugin.version,
      ...overrides,
    };
  }

  /**
   * Safely invokes a lifecycle hook, catching and handling any errors.
   */
  private async safeInvoke<T>(
    plugin: LoadedTemplatePlugin,
    phase: PluginLifecyclePhase,
    fn: () => T | Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await fn();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.invokeErrorHandler(plugin, phase, err);
      throw err;
    }
  }

  /**
   * Invokes the onError handler for a plugin, if defined.
   * Errors in the error handler itself are logged but not propagated.
   */
  private invokeErrorHandler(
    plugin: LoadedTemplatePlugin,
    phase: PluginLifecyclePhase,
    error: Error,
  ): void {
    const lifecycle = plugin.lifecycle ?? plugin.module.lifecycle;
    if (!lifecycle?.onError) return;

    const context: PluginErrorContext = {
      pluginName: plugin.name,
      pluginVersion: plugin.version,
      error,
      phase,
    };

    try {
      lifecycle.onError(context);
    } catch (handlerError) {
      // eslint-disable-next-line no-console
      console.error(
        `Error in plugin ${plugin.name} error handler:`,
        handlerError,
      );
    }
  }

  /**
   * Calls the onLoad hook for all plugins.
   * This should be called once after plugins are loaded.
   */
  async invokeLoad(): Promise<void> {
    for (const plugin of this.plugins) {
      const lifecycle = plugin.lifecycle ?? plugin.module.lifecycle;
      if (!lifecycle?.onLoad) continue;

      await this.safeInvoke(plugin, "load", () =>
        lifecycle.onLoad!(this.createContext(plugin)),
      );
    }
  }

  /**
   * Calls the onActivate hook for all plugins.
   * This should be called before generation starts.
   *
   * @param templateName - The name of the template being generated
   * @param projectRepositoryName - The name of the project repository
   */
  async invokeActivate(
    templateName?: string,
    projectRepositoryName?: string,
  ): Promise<void> {
    for (const plugin of this.plugins) {
      if (this.activatedPlugins.has(plugin.name)) continue;

      const lifecycle = plugin.lifecycle ?? plugin.module.lifecycle;
      if (!lifecycle?.onActivate) {
        this.activatedPlugins.add(plugin.name);
        continue;
      }

      await this.safeInvoke(plugin, "activate", () =>
        lifecycle.onActivate!(
          this.createContext(plugin, { templateName, projectRepositoryName }),
        ),
      );
      this.activatedPlugins.add(plugin.name);
    }
  }

  /**
   * Calls the onBeforeGenerate hook for all plugins.
   * This should be called immediately before template generation starts.
   *
   * @param templateName - The name of the template being generated
   * @param projectRepositoryName - The name of the project repository
   */
  async invokeBeforeGenerate(
    templateName?: string,
    projectRepositoryName?: string,
  ): Promise<void> {
    for (const plugin of this.plugins) {
      const lifecycle = plugin.lifecycle ?? plugin.module.lifecycle;
      if (!lifecycle?.onBeforeGenerate) continue;

      await this.safeInvoke(plugin, "before-generate", () =>
        lifecycle.onBeforeGenerate!(
          this.createContext(plugin, { templateName, projectRepositoryName }),
        ),
      );
    }
  }

  /**
   * Calls the onAfterGenerate hook for all plugins.
   * This should be called after template generation completes.
   *
   * @param result - The result of the generation operation
   * @param templateName - The name of the template being generated
   * @param projectRepositoryName - The name of the project repository
   */
  async invokeAfterGenerate(
    result: PluginGenerationResult,
    templateName?: string,
    projectRepositoryName?: string,
  ): Promise<void> {
    for (const plugin of this.plugins) {
      const lifecycle = plugin.lifecycle ?? plugin.module.lifecycle;
      if (!lifecycle?.onAfterGenerate) continue;

      // Don't throw from after-generate - just log errors
      try {
        await lifecycle.onAfterGenerate(
          this.createContext(plugin, { templateName, projectRepositoryName }),
          result,
        );
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.invokeErrorHandler(plugin, "after-generate", err);
        // Continue with other plugins
      }
    }
  }

  /**
   * Calls the onDeactivate hook for all activated plugins.
   * This should be called when the plugin is being unloaded.
   */
  async invokeDeactivate(): Promise<void> {
    // Deactivate in reverse order
    const pluginsToDeactivate = [...this.plugins].reverse();

    for (const plugin of pluginsToDeactivate) {
      if (!this.activatedPlugins.has(plugin.name)) continue;

      const lifecycle = plugin.lifecycle ?? plugin.module.lifecycle;
      if (!lifecycle?.onDeactivate) {
        this.activatedPlugins.delete(plugin.name);
        continue;
      }

      // Don't throw from deactivate - just log errors
      try {
        await lifecycle.onDeactivate(this.createContext(plugin));
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.invokeErrorHandler(plugin, "deactivate", err);
        // Continue with other plugins
      }
      this.activatedPlugins.delete(plugin.name);
    }
  }

  /**
   * Returns the list of plugins that have been activated.
   */
  getActivatedPlugins(): string[] {
    return Array.from(this.activatedPlugins);
  }
}

/**
 * Creates a PluginLifecycleManager for the given plugins.
 */
export function createPluginLifecycleManager(
  plugins: LoadedTemplatePlugin[],
): PluginLifecycleManager {
  return new PluginLifecycleManager(plugins);
}
