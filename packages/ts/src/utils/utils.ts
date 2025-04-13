import { TemplateSettingsType, AnyOrCallback } from "@timonteutelink/template-types-lib";
import z from "zod";
import { TemplateDTO } from "./types";

export function anyOrCallbackToAny<TSettings extends TemplateSettingsType<z.AnyZodObject>, T>(anyOrCallback: AnyOrCallback<TSettings, T>, parsedUserSettings: TSettings): T {
  return anyOrCallback instanceof Function ? anyOrCallback(parsedUserSettings) : anyOrCallback;
}

export function stringOrCallbackToString<TSettings extends TemplateSettingsType<z.AnyZodObject>>(strOrCallback: AnyOrCallback<TSettings, string>, parsedUserSettings: TSettings): string {
  return anyOrCallbackToAny(strOrCallback, parsedUserSettings);
}

export function findTemplate(rootTemplate: TemplateDTO, subTemplateName: string): TemplateDTO | null {
  if (rootTemplate.config.templateConfig.name === subTemplateName) {
    return rootTemplate;
  }

  for (const subTemplates of Object.values(rootTemplate.subTemplates)) {
    for (const subTemplate of subTemplates) {
      const foundTemplate = findTemplate(subTemplate, subTemplateName);
      if (foundTemplate) {
        return foundTemplate;
      }
    }
  }

  return null;
}
