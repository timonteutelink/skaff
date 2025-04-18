import {
  TemplateSettingsType,
  AnyOrCallback,
} from "@timonteutelink/template-types-lib";
import z from "zod";
import { Result, TemplateDTO } from "./types";

export function anyOrCallbackToAny<
  TSettings extends TemplateSettingsType<z.AnyZodObject>,
  T,
>(
  anyOrCallback: AnyOrCallback<TSettings, T>,
  parsedUserSettings: TSettings,
): Result<T> {
  try {
    return {
      data:
        anyOrCallback instanceof Function
          ? anyOrCallback(parsedUserSettings)
          : anyOrCallback,
    };
  } catch (e) {
    console.error("Error in anyOrCallbackToAny:", e);
    return { error: "Invalid anyOrCallback" + e };
  }
}

export function stringOrCallbackToString<
  TSettings extends TemplateSettingsType<z.AnyZodObject>,
>(
  strOrCallback: AnyOrCallback<TSettings, string>,
  parsedUserSettings: TSettings,
): Result<string> {
  return anyOrCallbackToAny(strOrCallback, parsedUserSettings);
}

export function findTemplate(
  rootTemplate: TemplateDTO,
  subTemplateName: string,
): Result<TemplateDTO | null> {
  if (rootTemplate.config.templateConfig.name === subTemplateName) {
    return { data: rootTemplate };
  }

  for (const subTemplates of Object.values(rootTemplate.subTemplates)) {
    for (const subTemplate of subTemplates) {
      return findTemplate(subTemplate, subTemplateName);
    }
  }

  return { data: null };
}

export function nullError<T>(
  result: Result<T>,
): T | null {
  if ("error" in result) {
    console.error(result.error);
    return null;
  }
  return result.data;
}

export function deepSortObject<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(deepSortObject) as any;
  }
  if (obj !== null && typeof obj === "object") {
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, any> = {};
    for (const key of sortedKeys) {
      result[key] = deepSortObject((obj as any)[key]);
    }
    return result as T;
  }
  return obj;
}

