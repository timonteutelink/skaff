import fs from "fs-extra";
import path from "node:path";
import { logError } from "../../lib/utils";
import { Result } from "../../lib/types";
import { FileRollbackManager } from "../shared/FileRollbackManager";

export class RollbackFileSystem {
  private rollbackManager?: FileRollbackManager;

  public setRollbackManager(rollbackManager?: FileRollbackManager): void {
    this.rollbackManager = rollbackManager;
  }

  public clearRollbackManager(): void {
    this.rollbackManager = undefined;
  }

  public async ensureDirectory(dirPath: string): Promise<Result<void>> {
    if (this.rollbackManager) {
      const result = await this.rollbackManager.ensureDir(dirPath);

      if ("error" in result) {
        logError({ shortMessage: result.error });
      }

      return result;
    }

    try {
      await fs.ensureDir(dirPath);
      return { data: undefined };
    } catch (error) {
      logError({
        shortMessage: `Failed to ensure directory ${dirPath}`,
        error,
      });
      return {
        error: `Failed to ensure directory ${dirPath}: ${error}`,
      };
    }
  }

  public async trackFile(filePath: string): Promise<Result<void>> {
    if (!this.rollbackManager) {
      return { data: undefined };
    }

    const result = await this.rollbackManager.trackFile(filePath);

    if ("error" in result) {
      logError({ shortMessage: result.error });
    }

    return result;
  }

  public async prepareFileForWrite(filePath: string): Promise<Result<void>> {
    const dirResult = await this.ensureDirectory(path.dirname(filePath));

    if ("error" in dirResult) {
      return dirResult;
    }

    return this.trackFile(filePath);
  }
}
