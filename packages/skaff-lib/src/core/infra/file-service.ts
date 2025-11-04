import * as fs from "node:fs/promises";
import { backendLogger } from "../../lib/logger";
import { Result } from "../../lib";

export async function makeDir(path: string): Promise<Result<void>> {
  try {
    await fs.mkdir(path, { recursive: true });
  } catch (error) {
    backendLogger.error(`Failed to create directory.`, error, path);
    return { error: `Failed to create directory at ${path}: ${error}` };
  }
  return { data: undefined };
}
