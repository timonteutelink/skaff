import { Result } from "@repo/ts/utils/types";
import { clsx, type ClassValue } from "clsx";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function toastNullError<T>(result: Result<T>): T | null {
  if ("error" in result) {
    console.error(result.error);
    toast.error(result.error);
    return null;
  }
  return result.data;
}
