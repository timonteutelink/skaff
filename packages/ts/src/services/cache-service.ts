import { tmpdir } from "node:os";
import path from "node:path";
import * as fs from "node:fs/promises";
import { makeDir } from "./file-service";
import { Result } from "../utils/types";

export type CacheKey = "template-config" | "new-template-diff";

export async function getCacheDir(): Promise<Result<string>> {
  const cacheDir = path.join(tmpdir(), "code-templator-cache");
  await makeDir(cacheDir);
  return { data: cacheDir };
}

export async function pathInCache(
  fileOrDirName: string,
): Promise<Result<string>> {
  const cacheDir = await getCacheDir();
  if ("error" in cacheDir) {
    console.error("Failed to get cache directory:", cacheDir.error);
    return { error: `Failed to get cache directory: ${cacheDir.error}` };
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
    console.error("Failed to get cache file path:", cacheFilePath.error);
    throw new Error(`Failed to get cache file path: ${cacheFilePath.error}`);
  }

  try {
    await fs.writeFile(cacheFilePath.data, value, "utf-8");
    console.log("Cache file created:", cacheFilePath);
  } catch (error) {
    console.error("Failed to write cache file:", error);
    throw new Error(`Failed to write cache file: ${error}`);
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
    console.error("Failed to get cache file path:", cacheFilePath.error);
    return { error: `Failed to get cache file path: ${cacheFilePath.error}` };
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
    console.error("Failed to read cache file:", error);
    return { error: `Failed to read cache file: ${error}` };
  }
}
