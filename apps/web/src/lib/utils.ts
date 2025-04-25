import { Result } from "@repo/ts/lib/types";
import { clsx, type ClassValue } from "clsx";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";
import logger from "./logger";
import { useRouter } from "next/navigation";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Same strings as pino Level type
type ToastLevel = 'info' | 'error' | 'warn';

export function showToast(message: string, level: ToastLevel) {
  if (level === "error") {
    toast.error(message);
  } else if (level === "warn") {
    toast.warning(message);
  } else {
    toast.info(message);
  }
}

type ToastErrorOptions<T> = {
  level?: ToastLevel;
  shortMessage?: string;
  result?: Result<T>;
  error?: unknown;
  nullErrorMessage?: string;
  nullRedirectPath?: string;
  router?: ReturnType<typeof useRouter>;
  redirectType?: "push" | "replace";
}

export function toastNullError<T>({ result, error, level = "error", shortMessage, nullErrorMessage, nullRedirectPath, router, redirectType = "push" }: ToastErrorOptions<T>): T | undefined {
  const assumedErrorObject = error as { message: string } | string | undefined;
  const toastErrorMessage = shortMessage || "An error occurred";

  if (assumedErrorObject) {
    let errorMessage: string = "An error occurred";
    if (typeof assumedErrorObject === "string") {
      errorMessage = assumedErrorObject;
    }
    if (typeof assumedErrorObject === "object" && "message" in assumedErrorObject) {
      errorMessage = assumedErrorObject.message;
    }
    logger[level]({ shortMessage, error: errorMessage });
    showToast(toastErrorMessage, level);
    return undefined;
  }

  if (!result) {
    logger[level](toastErrorMessage);
    showToast(toastErrorMessage, level);
    return undefined;
  }

  if ("error" in result) {
    logger[level]({ shortMessage, error: result.error });
    showToast(toastErrorMessage, level);
    return undefined;
  }

  if ((nullErrorMessage || (nullRedirectPath && router)) && result.data === null) {
    logger[level]({ shortMessage, error: nullErrorMessage });
    showToast(nullErrorMessage || toastErrorMessage, level);
    if (router && nullRedirectPath) {
      router[redirectType](nullRedirectPath);
    }
    return undefined;
  }

  return result.data;
}
