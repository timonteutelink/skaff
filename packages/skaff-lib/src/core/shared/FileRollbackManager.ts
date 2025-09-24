import fs from "fs-extra";
import path from "node:path";

import { backendLogger } from "../../lib/logger";
import { Result } from "../../lib/types";

interface FileSnapshot {
  existed: boolean;
  content?: Buffer;
  mode?: number;
}

export class FileRollbackManager {
  private readonly fileSnapshots = new Map<string, FileSnapshot>();
  private readonly createdDirectories = new Set<string>();

  public async ensureDir(dirPath: string): Promise<Result<void>> {
    const resolved = path.resolve(dirPath);
    const dirsToCreate: string[] = [];
    let current = resolved;

    while (true) {
      try {
        const stat = await fs.stat(current);
        if (!stat.isDirectory()) {
          return {
            error: `Path ${current} exists and is not a directory`,
          };
        }
        break;
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === "ENOENT") {
          dirsToCreate.push(current);
          const parent = path.dirname(current);
          if (parent === current) {
            break;
          }
          current = parent;
          continue;
        }
        return {
          error: `Failed to inspect directory ${current}: ${error}`,
        };
      }
    }

    try {
      await fs.ensureDir(resolved);
    } catch (error) {
      return {
        error: `Failed to ensure directory ${resolved}: ${error}`,
      };
    }

    dirsToCreate.forEach((dir) => this.createdDirectories.add(dir));

    return { data: undefined };
  }

  public async trackFile(filePath: string): Promise<Result<void>> {
    const resolved = path.resolve(filePath);
    if (this.fileSnapshots.has(resolved)) {
      return { data: undefined };
    }

    try {
      const stat = await fs.stat(resolved);
      if (!stat.isFile()) {
        return {
          error: `Path ${resolved} exists and is not a file`,
        };
      }
      const contents = await fs.readFile(resolved);
      this.fileSnapshots.set(resolved, {
        existed: true,
        content: contents,
        mode: stat.mode,
      });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        this.fileSnapshots.set(resolved, { existed: false });
      } else {
        return {
          error: `Failed to inspect file ${resolved}: ${error}`,
        };
      }
    }

    return { data: undefined };
  }

  public async rollback(): Promise<void> {
    const files = Array.from(this.fileSnapshots.entries()).reverse();
    for (const [filePath, snapshot] of files) {
      try {
        if (!snapshot.existed) {
          await fs.remove(filePath);
        } else if (snapshot.content !== undefined) {
          await fs.ensureDir(path.dirname(filePath));
          await fs.writeFile(filePath, snapshot.content);
          if (typeof snapshot.mode === "number") {
            await fs.chmod(filePath, snapshot.mode);
          }
        }
      } catch (error) {
        backendLogger.error(`Failed to rollback file ${filePath}`, error);
      }
    }

    const dirs = Array.from(this.createdDirectories).sort(
      (a, b) => b.length - a.length,
    );
    for (const dir of dirs) {
      try {
        const exists = await fs.pathExists(dir);
        if (!exists) {
          continue;
        }
        const entries = await fs.readdir(dir);
        if (entries.length === 0) {
          await fs.rmdir(dir);
        }
      } catch (error) {
        backendLogger.error(`Failed to rollback directory ${dir}`, error);
      }
    }

    this.clear();
  }

  public clear(): void {
    this.fileSnapshots.clear();
    this.createdDirectories.clear();
  }
}
