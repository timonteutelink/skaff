import { exec } from "node:child_process";
import { promisify } from "node:util";

import { getSkaffContainer } from "../../di/container";
import { ShellServiceToken } from "../../di/tokens";
import { Result } from "../../lib/types";
import { logError } from "../../lib/utils";

const asyncExec = promisify(exec);

export class ShellService {
  public async execute(
    commandCwd: string,
    command: string,
  ): Promise<Result<string>> {
    try {
      const { stdout } = await asyncExec(command, { cwd: commandCwd });
      return { data: stdout.trim() };
    } catch (error) {
      logError({
        shortMessage: "Error getting commit hash",
        error,
      });
      return { error: `Error getting commit hash: ${error}` };
    }
  }
}

export function resolveShellService(): ShellService {
  return getSkaffContainer().resolve(ShellServiceToken);
}
