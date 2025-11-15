import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { injectable } from "tsyringe";

import { getSkaffContainer } from "../../di/container";
import { NpmServiceToken } from "../../di/tokens";
import { getConfig } from "../../lib";
import { Result } from "../../lib/types";
import { logError } from "../../lib/utils";

const asyncExecFile = promisify(execFile);

@injectable()
export class NpmService {
  public async install(dirPath: string): Promise<Result<void>> {
    const npmPath = (await getConfig()).NPM_PATH;
    try {
      await asyncExecFile(
        npmPath,
        ["i", "--frozen-lockfile"],
        { cwd: dirPath },
      );

      return { data: undefined };
    } catch (error) {
      logError({
        shortMessage: `Error npm installing using: ${npmPath}`,
        error,
      });
      return { error: `Error npm installing using: ${npmPath}` };
    }
  }
}

export function resolveNpmService(): NpmService {
  return getSkaffContainer().resolve(NpmServiceToken);
}
