import { ProjectSettings } from "@timonteutelink/template-types-lib";

import { Result } from "../../lib/types";

export interface PluginSettingsUpdateOptions<TValue> {
  defaultValue?: TValue;
}

function notFound(instanceId: string): Result<never> {
  return {
    error: `Template instance ${instanceId} not found in project settings`,
  };
}

export class TemplatePluginSettingsStore {
  constructor(private readonly projectSettings: ProjectSettings) { }

  public getPluginSettings<TValue = unknown>(
    templateInstanceId: string,
    pluginName: string,
  ): Result<TValue | undefined> {
    const instantiated = this.projectSettings.instantiatedTemplates.find(
      (entry) => entry.id === templateInstanceId,
    );

    if (!instantiated) {
      return notFound(templateInstanceId);
    }

    const pluginData = instantiated.plugins?.[pluginName];

    return { data: pluginData as TValue | undefined };
  }

  public setPluginSettings<TValue = unknown>(
    templateInstanceId: string,
    pluginName: string,
    value: TValue,
  ): Result<TValue> {
    const instantiated = this.projectSettings.instantiatedTemplates.find(
      (entry) => entry.id === templateInstanceId,
    );

    if (!instantiated) {
      return notFound(templateInstanceId);
    }

    if (!instantiated.plugins) {
      instantiated.plugins = {};
    }

    instantiated.plugins[pluginName] = value as Record<string, unknown>;

    return { data: value };
  }

  public updatePluginSettings<TValue = Record<string, unknown>>(
    templateInstanceId: string,
    pluginName: string,
    updater: (value: TValue | undefined) => TValue,
    options?: PluginSettingsUpdateOptions<TValue>,
  ): Result<TValue> {
    const instantiated = this.projectSettings.instantiatedTemplates.find(
      (entry) => entry.id === templateInstanceId,
    );

    if (!instantiated) {
      return notFound(templateInstanceId);
    }

    const currentValue = (instantiated.plugins?.[pluginName] ??
      options?.defaultValue) as TValue | undefined;

    const nextValue = updater(currentValue);

    if (!instantiated.plugins) {
      instantiated.plugins = {};
    }

    instantiated.plugins[pluginName] = nextValue as Record<string, unknown>;

    return { data: nextValue };
  }
}

