import { UserTemplateSettings } from "@timonteutelink/template-types-lib";

export function renderTemplate(content: string, userSettings: UserTemplateSettings) {
  // Replace occurrences of {{key}} with the corresponding context value.
  return content.replace(/{{\s*(\w+)\s*}}/g, (_, key) => {
    return userSettings[key] !== undefined ? String(userSettings[key]) : '';
  });
}
