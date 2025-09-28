import { ProjectSettings } from "@timonteutelink/template-types-lib";

import { inject, injectable } from "tsyringe";

import { getSkaffContainer } from "../../di/container";
import { CacheServiceToken, DiffCacheToken } from "../../di/tokens";
import { Result } from "../../lib/types";
import { CacheKey, CacheService } from "../infra/cache-service";

@injectable()
export class DiffCache {
  constructor(
    @inject(CacheServiceToken) private readonly cacheService: CacheService,
  ) {}

  public computeSettingsHash(settings: ProjectSettings): string {
    return this.cacheService.hash(JSON.stringify(settings));
  }

  public async getCachedDiff(
    cacheKey: CacheKey,
    hash: string,
    extension: string,
  ): Promise<Result<{ data: string; path: string } | null>> {
    return this.cacheService.retrieveFromCache(cacheKey, hash, extension);
  }

  public async saveDiff(
    cacheKey: CacheKey,
    hash: string,
    extension: string,
    content: string,
  ): Promise<Result<string>> {
    return this.cacheService.saveToCache(cacheKey, hash, extension, content);
  }

  public async resolveTempPath(name: string): Promise<Result<string>> {
    return this.cacheService.pathInCache(name);
  }
}

export function resolveDiffCache(): DiffCache {
  return getSkaffContainer().resolve(DiffCacheToken);
}
