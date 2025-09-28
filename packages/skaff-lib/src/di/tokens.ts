import type { InjectionToken } from "tsyringe";

import { CacheService } from "../core/infra/cache-service";
import { FileSystemService } from "../core/infra/file-service";

export const FileSystemServiceToken: InjectionToken<FileSystemService> =
  FileSystemService;

export const CacheServiceToken: InjectionToken<CacheService> = CacheService;

export const TOKENS = {
  FileSystemService: FileSystemServiceToken,
  CacheService: CacheServiceToken,
} as const;
