import { tmpdir } from "node:os";
import path from "node:path";
import * as fs from "node:fs/promises";
import { makeDir } from "./file-service";
import { Result } from "../lib/types";
import { createHash } from "node:crypto";
import { backendLogger } from "../lib/logger";
import { logError } from "../lib/utils";

export type CacheKey =
  | "template-config"
  | "new-template-diff"
  | "project-from-template-diff"
  | "temp-diff"

export function getHash(stringToHash: string): string {
  return createHash("sha256").update(stringToHash).digest("hex");
}

export function getCacheDirPath(): string {
  return path.join(tmpdir(), "code-templator-cache");
}

export async function getCacheDir(): Promise<Result<string>> {
  const cacheDir = getCacheDirPath();
  await makeDir(cacheDir);
  return { data: cacheDir };
}

export async function pathInCache(
  fileOrDirName: string,
): Promise<Result<string>> {
  const cacheDir = await getCacheDir();
  if ("error" in cacheDir) {
    return cacheDir;
  }

  const cacheFilePath = path.join(cacheDir.data, fileOrDirName);

  return { data: cacheFilePath };
}

export async function saveToCache(
  cacheKey: CacheKey,
  hash: string,
  extension: string,
  value: string,
): Promise<Result<string>> {
  const cacheFilePath = await pathInCache(`${cacheKey}-${hash}.${extension}`);

  if ("error" in cacheFilePath) {
    return cacheFilePath;
  }

  try {
    await fs.writeFile(cacheFilePath.data, value.trim() + "\n", "utf-8");
    backendLogger.info(`Cache file created at ${cacheFilePath.data}`);
  } catch (error) {
    backendLogger.error({ message: "Failed to write cache file:", error });
    return { error: `Failed to write cache file: ${error}` };
  }

  return cacheFilePath;
}

export async function retrieveFromCache(
  cacheKey: CacheKey,
  hash: string,
  extension: string,
): Promise<Result<{ data: string; path: string } | null>> {
  const cacheFilePath = await pathInCache(`${cacheKey}-${hash}.${extension}`);

  if ("error" in cacheFilePath) {
    return cacheFilePath;
  }

  try {
    const stats = await fs.stat(cacheFilePath.data).catch(() => null);

    if (stats && stats.isFile()) {
      return {
        data: {
          data: await fs.readFile(cacheFilePath.data, "utf-8"),
          path: cacheFilePath.data,
        },
      };
    }

    return { data: null };
  } catch (error) {
    logError({
      shortMessage: "Failed to read cache file",
      error,
    });
    return { error: `Failed to read cache file: ${error}` };
  }
}

export async function runEraseCache(): Promise<Result<void>> {
  const cacheDir = await getCacheDir();
  if ("error" in cacheDir) {
    return cacheDir;
  }

  try {
    await fs.rm(cacheDir.data, { recursive: true, force: true });
    backendLogger.info("Cache erased");
  } catch (error) {
    logError({
      shortMessage: "Failed to erase cache",
      error,
    });
    return { error: `Failed to erase cache: ${error}` };
  }

  return { data: undefined };
}
