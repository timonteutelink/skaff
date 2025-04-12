import z from "zod";

export type UserTemplateSettings = Record<string, any>;

export type TemplateSettingsType<TSettingsSchema extends z.AnyZodObject, TParentSettings extends UserTemplateSettings = {}> = {
	project_name: string;
	ai_results?: Record<string, string>;
} & z.output<TSettingsSchema> & TParentSettings; //return type is still a UserTemplateSettings but is the Full template settings

export type AnyOrCallback<TSettings extends TemplateSettingsType<z.AnyZodObject>, T> = T | ((settings: TSettings) => T);
export type StringOrCallback<TSettings extends TemplateSettingsType<z.AnyZodObject>> = AnyOrCallback<TSettings, string>;
