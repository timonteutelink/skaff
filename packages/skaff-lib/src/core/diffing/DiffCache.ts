import { ProjectSettings } from "@timonteutelink/template-types-lib";

import { Result } from "../../lib/types";
import {
  CacheKey,
  getHash,
  pathInCache,
  retrieveFromCache,
  saveToCache,
} from "../../services/cache-service";

export class DiffCache {
  public computeSettingsHash(settings: ProjectSettings): string {
    return getHash(JSON.stringify(settings));
  }

  public async getCachedDiff(
    cacheKey: CacheKey,
    hash: string,
    extension: string,
  ): Promise<Result<{ data: string; path: string } | null>> {
    return retrieveFromCache(cacheKey, hash, extension);
  }

  public async saveDiff(
    cacheKey: CacheKey,
    hash: string,
    extension: string,
    content: string,
  ): Promise<Result<string>> {
    return saveToCache(cacheKey, hash, extension, content);
  }

  public async resolveTempPath(name: string): Promise<Result<string>> {
    return pathInCache(name);
  }
}
