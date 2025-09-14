export type UserTemplateSettings = Record<string, unknown>;
export type FinalTemplateSettings = Record<string, unknown>;

export type AiResultsObject = Record<string, string>;

export type AnyOrCallback<
  TFinalSettings extends FinalTemplateSettings,
  T,
> = T | ((settings: TFinalSettings & { aiResults: AiResultsObject }) => T);
export type StringOrCallback<
  TFinalSettings extends FinalTemplateSettings
> = AnyOrCallback<TFinalSettings, string>;
