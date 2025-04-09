import z from "zod";

export type UserTemplateSettings = Record<string, any>;
export type StringOrCallback<T extends UserTemplateSettings> = string | ((settings: T) => string);
export type TemplateSettingsType<TSettingsSchema extends z.AnyZodObject, TParentSettings extends UserTemplateSettings = {}> = {
	project_name: string;
} & z.infer<TSettingsSchema> & TParentSettings; //return type is still a UserTemplateSettings
