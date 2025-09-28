import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { injectable } from "tsyringe";

import { getSkaffContainer } from "../../di/container";
import { backendLogger } from "../../lib/logger";
import { Result } from "../../lib/types";
import { logError } from "../../lib/utils";
import { FileSystemService } from "./file-service";

export type CacheKey =
  | "template-config"
  | "new-template-diff"
  | "project-from-template-diff"
  | "temp-diff"

@injectable()
export class CacheService {
  constructor(private readonly fileSystem: FileSystemService) {}

  public hash(stringToHash: string): string {
    return createHash("sha256").update(stringToHash).digest("hex");
  }

  public getCacheDirPath(): string {
    return (
      process.env.SKAFF_CACHE_PATH || path.join(tmpdir(), "skaff-cache")
    );
  }

  public async getCacheDir(): Promise<Result<string>> {
    const cacheDir = this.getCacheDirPath();
    const ensureDirResult = await this.fileSystem.makeDir(cacheDir);

    if ("error" in ensureDirResult) {
      return ensureDirResult;
    }

    return { data: cacheDir };
  }

  public async pathInCache(fileOrDirName: string): Promise<Result<string>> {
    const cacheDir = await this.getCacheDir();
    if ("error" in cacheDir) {
      return cacheDir;
    }

    const cacheFilePath = path.join(cacheDir.data, fileOrDirName);

    return { data: cacheFilePath };
  }

  public async saveToCache(
    cacheKey: CacheKey,
    hash: string,
    extension: string,
    value: string,
  ): Promise<Result<string>> {
    const cacheFilePath = await this.pathInCache(
      `${cacheKey}-${hash}.${extension}`,
    );

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

  public async retrieveFromCache(
    cacheKey: CacheKey,
    hash: string,
    extension: string,
  ): Promise<Result<{ data: string; path: string } | null>> {
    const cacheFilePath = await this.pathInCache(
      `${cacheKey}-${hash}.${extension}`,
    );

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

  public async runEraseCache(): Promise<Result<void>> {
    const cacheDir = await this.getCacheDir();
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
}

export function resolveCacheService(): CacheService {
  return getSkaffContainer().resolve(CacheService);
}
