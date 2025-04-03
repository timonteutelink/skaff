import { UserTemplateSettings } from "@timonteutelink/template-types-lib";

export function stringOrCallbackToString(stringOrCallback: string | ((settings: UserTemplateSettings) => string), parsedUserSettings: UserTemplateSettings): string {
  return typeof stringOrCallback === 'string' ? stringOrCallback : stringOrCallback(parsedUserSettings);
}
