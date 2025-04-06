export type UserTemplateSettings = Record<string, any>;
export type StringOrCallback<T extends UserTemplateSettings> = string | ((settings: T) => string);
