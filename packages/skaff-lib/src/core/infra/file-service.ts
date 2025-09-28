import * as fs from "node:fs/promises";
import { injectable } from "tsyringe";

import { getSkaffContainer } from "../../di/container";
import { backendLogger } from "../../lib/logger";
import { Result } from "../../lib/types";

@injectable()
export class FileSystemService {
  public async makeDir(path: string): Promise<Result<void>> {
    try {
      await fs.mkdir(path, { recursive: true });
    } catch (error) {
      backendLogger.error(`Failed to create directory.`, error, path);
      return { error: `Failed to create directory at ${path}: ${error}` };
    }
    return { data: undefined };
  }
}

export function resolveFileSystemService(): FileSystemService {
  return getSkaffContainer().resolve(FileSystemService);
}
