import { TemplateSettingsType } from "@timonteutelink/template-types-lib";
import z from "zod";

export function stringOrCallbackToString(stringOrCallback: string | ((settings: TemplateSettingsType<z.AnyZodObject>) => string), parsedUserSettings: TemplateSettingsType<z.AnyZodObject>): string {
  return typeof stringOrCallback === 'string' ? stringOrCallback : stringOrCallback(parsedUserSettings);
}
