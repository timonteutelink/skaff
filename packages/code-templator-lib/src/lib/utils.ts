import {
  AnyOrCallback,
  FinalTemplateSettings,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import { Result } from "./types";
import { logger } from "./logger";
import { Level } from "pino";

export function anyOrCallbackToAny<
  TSettings extends FinalTemplateSettings,
  T,
>(
  anyOrCallback: AnyOrCallback<TSettings, T>,
  parsedUserSettings: TSettings,
): Result<T> {
  try {
    return {
      data:
        typeof anyOrCallback === "function"
          ? (anyOrCallback as (userSettings: UserTemplateSettings) => T)(
            parsedUserSettings,
          )
          : anyOrCallback,
    };
  } catch (error) {
    logError({
      shortMessage: "Error in anyOrCallbackToAny",
      error,
    });
    return { error: `Error in anyOrCallbackToAny: ${error}` };
  }
}

export function stringOrCallbackToString<
  TSettings extends FinalTemplateSettings,
>(
  strOrCallback: AnyOrCallback<TSettings, string>,
  parsedUserSettings: TSettings,
): Result<string> {
  return anyOrCallbackToAny(strOrCallback, parsedUserSettings);
}

export interface LogErrorOptions<T> {
  level?: Level;
  shortMessage?: string;
  result?: Result<T>;
  error?: unknown;
  nullErrorMessage?: string;
}

export function logError<T>({
  level = "error",
  shortMessage,
  result,
  error,
  nullErrorMessage,
}: LogErrorOptions<T>): T | false {
  const log = (err: unknown, message: string) =>
    logger[level]({ err }, message);
  const msg = shortMessage || "An error occurred";

  if (error) {
    log(error, msg);
    return false;
  }

  if (!result) {
    log(new Error(shortMessage), msg);
    return false;
  }

  if ("error" in result) {
    log(new Error(result.error), msg);
    return false;
  }

  if (nullErrorMessage && result.data === null) {
    log(new Error(nullErrorMessage), msg);
    return false;
  }

  return result.data;
}
