import "server-only";
import { exec } from "node:child_process";
import util from "node:util";
import { spawn } from "node:child_process";

const asyncExec = util.promisify(exec);

export async function showGitDiff(cwd: string): Promise<void> {
  try {
    const gitDiff = spawn("git", ["diff"], {
      cwd,
      stdio: "inherit",
      env: { ...process.env, GIT_PAGER: "less" },
    });

    await new Promise((resolve, reject) => {
      gitDiff.on("close", resolve);
      gitDiff.on("error", reject);
    });
  } catch (error) {
    console.error("Error showing git diff:", error);
  }
}

export async function isGitRepoClean(hostRepoPath: string): Promise<boolean> {
  try {
    const status = (
      await asyncExec(`cd ${hostRepoPath} && git status --porcelain`)
    ).stdout.trim();
    return status.length === 0;
  } catch (error) {
    console.error("Error checking git status:", error);
    return false;
  }
}

export async function diffDirectories(absoluteBaseProjectPath: string, absoluteNewProjectPath: string): Promise<void> {
  try {
    const diff = spawn("git", ["diff", absoluteBaseProjectPath, absoluteNewProjectPath], {
      stdio: "inherit",
      env: { ...process.env, GIT_PAGER: "less" },
    });

    await new Promise((resolve, reject) => {
      diff.on("close", resolve);
      diff.on("error", reject);
    });
  } catch (error) {
    console.error("Error showing git diff:", error);
  }
}
