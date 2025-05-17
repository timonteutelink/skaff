import { promisify } from "node:util";
import { Result } from "../lib/types";
import { execFile } from "node:child_process";
import { logError } from "../lib/utils";
import { getConfig } from "../lib";

const asyncExecFile = promisify(execFile);

export async function npmInstall(
  dirPath: string,
): Promise<Result<void>> {
  const npmPath = (await getConfig()).NPM_PATH;
  try {
    await asyncExecFile(npmPath, [
      "i",
      "--prefer-offline",
      "--prefer-frozen-lockfile",
    ], { cwd: dirPath });

    return { data: undefined };
  } catch (error) {
    logError({
      shortMessage: `Error npm installing using: ${npmPath}`,
      error,
    });
    return { error: `Error npm installing using: ${npmPath}` };
  }
}
