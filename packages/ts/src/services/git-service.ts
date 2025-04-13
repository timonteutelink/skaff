import { exec, execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import "server-only";
import { GENERATE_DIFF_SCRIPT_PATH } from "../utils/env";
import { DiffHunk, ParsedFile } from "../utils/types";

const asyncExecFile = promisify(execFile);
const asyncExec = promisify(exec);

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

export async function diffDirectories(
  absoluteBaseProjectPath: string,
  absoluteNewProjectPath: string
): Promise<string | null> {
  try {
    const { stdout } = await asyncExecFile(GENERATE_DIFF_SCRIPT_PATH, [
      absoluteBaseProjectPath,
      absoluteNewProjectPath,
    ]);

    return stdout;
  } catch (error) {
    console.error("Error generating diff:", error);
    return null;
  }
}

export function parseGitDiff(diffText: string): ParsedFile[] {
  const files: ParsedFile[] = []
  const lines = diffText.split("\n")

  let currentFile: ParsedFile | null = null
  let currentHunk: DiffHunk | null = null

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]!;

    // File header
    if (line.startsWith("diff --git")) {
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk)
        currentHunk = null
      }

      if (currentFile) {
        files.push(currentFile)
      }

      // Extract file path
      const match = line.match(/diff --git a\/(.*) b\/(.*)/)
      if (match) {
        const filePath = match[1]!
        currentFile = {
          path: filePath,
          status: "modified", // Default status, will be updated later
          hunks: [],
        }
      }
    }

    // File status
    else if (line.startsWith("new file")) {
      if (currentFile) {
        currentFile.status = "added"
      }
    } else if (line.startsWith("deleted file")) {
      if (currentFile) {
        currentFile.status = "deleted"
      }
    }

    // Hunk header
    else if (line.startsWith("@@")) {
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk)
      }

      const match = line.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/)
      if (match) {
        currentHunk = {
          oldStart: Number.parseInt(match[1]!),
          oldLines: Number.parseInt(match[2]!),
          newStart: Number.parseInt(match[3]!),
          newLines: Number.parseInt(match[4]!),
          lines: [],
        }
      }
    }

    // Diff content
    else if (currentHunk && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" "))) {
      currentHunk.lines.push(line)
    }
  }

  // Add the last hunk and file
  if (currentFile && currentHunk) {
    currentFile.hunks.push(currentHunk)
  }

  if (currentFile) {
    files.push(currentFile)
  }

  return files
}
