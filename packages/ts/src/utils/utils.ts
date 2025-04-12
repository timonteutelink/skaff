import { TemplateSettingsType, AnyOrCallback } from "@timonteutelink/template-types-lib";
import z from "zod";

export function anyOrCallbackToAny<TSettings extends TemplateSettingsType<z.AnyZodObject>, T>(anyOrCallback: AnyOrCallback<TSettings, T>, parsedUserSettings: TSettings): T {
  return anyOrCallback instanceof Function ? anyOrCallback(parsedUserSettings) : anyOrCallback;
}

export function stringOrCallbackToString<TSettings extends TemplateSettingsType<z.AnyZodObject>>(strOrCallback: AnyOrCallback<TSettings, string>, parsedUserSettings: TSettings): string {
  return anyOrCallbackToAny(strOrCallback, parsedUserSettings);
}
