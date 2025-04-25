import * as fs from "node:fs/promises";
import { Result } from "../lib/types";

export async function makeDir(path: string): Promise<Result<void>> {
  try {
    await fs.mkdir(path, { recursive: true });
  } catch (error) {
    logger.error(`Failed to create directory at ${path}: ${error}`);
    return { error: `Failed to create directory at ${path}: ${error}` };
  }
  return { data: undefined };
}
