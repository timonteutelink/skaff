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

export function toastNullError<T>({ result, error, level = "error", shortMessage, nullErrorMessage, nullRedirectPath, router, redirectType = "push" }: ToastErrorOptions<T>): T | false {
  const log = (err: unknown, message: string) => logger[level]({ err }, message);
  const toastErrorMessage = shortMessage || "An error occurred";

  if (error) {
    log(error, toastErrorMessage);
    showToast(toastErrorMessage, level);
    return false;
  }

  if (!result) {
    log(new Error(toastErrorMessage), toastErrorMessage);
    showToast(toastErrorMessage, level);
    return false;
  }

  if ("error" in result) {
    log(new Error(result.error), toastErrorMessage);
    showToast(toastErrorMessage, level);
    return false;
  }

  if ((nullErrorMessage || (nullRedirectPath && router)) && result.data === null) {
    log(new Error(nullErrorMessage || toastErrorMessage), nullErrorMessage || toastErrorMessage);
    showToast(nullErrorMessage || toastErrorMessage, level);
    if (router && nullRedirectPath) {
      router[redirectType](nullRedirectPath);
    }
    return false;
  }

  return result.data;
}
