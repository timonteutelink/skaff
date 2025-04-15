import { tmpdir } from "node:os";
import path from "node:path";
import * as fs from "node:fs/promises";
import { makeDir } from "./file-service";

export type CacheKey = 'template-config' | 'new-template-diff';

export async function getCacheDir(): Promise<string> {
  const cacheDir = path.join(tmpdir(), "code-templator-cache");
  await makeDir(cacheDir);
  return cacheDir;
}

export async function pathInCache(fileOrDirName: string): Promise<string> {
  const cacheDir = await getCacheDir();
  const cacheFilePath = path.join(cacheDir, fileOrDirName);

  return cacheFilePath;
}

export async function saveToCache(
  cacheKey: CacheKey,
  hash: string,
  extension: string,
  value: string,
): Promise<string> {
  const cacheFilePath = await pathInCache(`${cacheKey}-${hash}.${extension}`);
  await fs.writeFile(cacheFilePath, value, "utf-8");
  console.log("Cache file created:", cacheFilePath);
  return cacheFilePath;
}

export async function retrieveFromCache(
  cacheKey: CacheKey,
  hash: string,
  extension: string,
): Promise<{ data: string; path: string } | null> {
  const cacheFilePath = await pathInCache(`${cacheKey}-${hash}.${extension}`);

  const stats = await fs.stat(cacheFilePath).catch(() => null);

  if (stats && stats.isFile()) {
    return { data: await fs.readFile(cacheFilePath, "utf-8"), path: cacheFilePath };
  }

  return null;
}
