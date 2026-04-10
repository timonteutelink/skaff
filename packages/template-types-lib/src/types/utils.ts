export type UserTemplateSettings = Record<string, any>;
export type FinalTemplateSettings = Record<string, any>;

export type AnyOrCallback<
  TFinalSettings extends FinalTemplateSettings,
  T,
> = T | ((settings: TFinalSettings) => T);
export type StringOrCallback<
  TFinalSettings extends FinalTemplateSettings
> = AnyOrCallback<TFinalSettings, string>;
