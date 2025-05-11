import { promisify } from "node:util";
import { Result } from "../lib/types";
import { execFile } from "node:child_process";
import { logError } from "../lib/utils";
import { NPM_PATH } from "../lib/env";

const asyncExecFile = promisify(execFile);

export async function npmInstall(
  dirPath: string,
): Promise<Result<void>> {
  try {
    await asyncExecFile(NPM_PATH, [
      "i",
      "--prefer-offline",
      "--prefer-frozen-lockfile",
    ], { cwd: dirPath });

    return { data: undefined };
  } catch (error) {
    logError({
      shortMessage: `Error npm installing using: ${NPM_PATH}`,
      error,
    });
    return { error: `Error npm installing using: ${NPM_PATH}` };
  }
}
