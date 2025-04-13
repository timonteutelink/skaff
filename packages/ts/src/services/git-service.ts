import "server-only";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import { GENERATE_DIFF_SCRIPT_PATH } from "../utils/env";
import { DiffHunk, ParsedFile } from "../utils/types";

const asyncExecFile = promisify(execFile);
const asyncExec = promisify(exec);

export async function addAllAndDiff(
  repoPath: string,
): Promise<string | null> {
  try {
    await asyncExec(`cd ${repoPath} && git add .`);
    const { stdout } = await asyncExec(
      `cd ${repoPath} && git diff --staged --no-color --no-ext-diff`,
    );
    return stdout;
  } catch (error) {
    console.error("Error adding files and generating diff:", error);
    return null;
  }
}

export async function createGitRepo(
  repoPath: string,
): Promise<boolean> {
  try {
    await asyncExec(`cd ${repoPath} && git init`);
    return true;
  } catch (error) {
    console.error("Error creating git repository:", error);
    return false;
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
