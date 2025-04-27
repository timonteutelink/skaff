import { AnyOrCallback, TemplateSettingsType } from "@timonteutelink/template-types-lib";
import { Result } from "./types";
import { logger } from "./logger";
import z from "zod";

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
  } catch (error) {
    logger.error({ error }, `Error in anyOrCallbackToAny.`);
    return { error: `Error in anyOrCallbackToAny: ${error}` };
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
