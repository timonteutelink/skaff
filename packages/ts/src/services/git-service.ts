import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import { GENERATE_DIFF_SCRIPT_PATH } from "../utils/env";
import { DiffHunk, GitStatus, ParsedFile, Result } from "../utils/types";
import * as fs from "node:fs/promises";

const asyncExecFile = promisify(execFile);
const asyncExec = promisify(exec);

export async function switchBranch(
  repoPath: string,
  branchName: string,
): Promise<Result<void>> {
  try {
    const isClean = await isGitRepoClean(repoPath);

    if (!isClean) {
      console.error("Cannot switch branches with uncommitted changes.");
      return {
        error: "Cannot switch branches with uncommitted changes.",
      }
    }

    await asyncExec(`cd ${repoPath} && git checkout ${branchName}`);
    return { data: undefined };
  } catch (error) {
    console.error("Error switching branches:", error);
    return {
      error: `Error switching branches: ${error}`,
    };
  }
}

export async function listBranches(repoPath: string): Promise<Result<string[]>> {
  try {
    const { stdout } = await asyncExec(`cd ${repoPath} && git branch --list`);
    return {
      data: stdout.trim()
        .split("\n")
        .map((branch) => branch.trim())
        .filter((branch) => branch.length > 0)
    };
  } catch (error) {
    console.error("Error listing branches:", error);
    return { error: `Error listing branches: ${error}` };
  }
}

export async function getCurrentBranch(repoPath: string): Promise<Result<string>> {
  try {
    const { stdout } = await asyncExec(`cd ${repoPath} && git rev-parse --abbrev-ref HEAD`);
    return { data: stdout.trim() };
  } catch (error) {
    console.error("Error getting current branch:", error);
    return { error: `Error getting current branch: ${error}` };
  }
}

export async function loadGitStatus(repoPath: string): Promise<Result<GitStatus>> {
  const [branches, isClean, currentBranch] = await Promise.all([
    listBranches(repoPath),
    isGitRepoClean(repoPath),
    getCurrentBranch(repoPath),
  ]);

  if ("error" in branches) {
    console.error("Error loading branches:", branches.error);
    return { error: `Error loading branches: ${branches.error}` };
  }

  if (branches.data.length === 0) {
    console.error("No branches found or error listing branches.");
    return { error: "No branches found or error listing branches." };
  }

  if ('error' in isClean) {
    console.error("Error checking git status:", isClean.error);
    return { error: `Error checking git status: ${isClean.error}` };
  }

  if ('error' in currentBranch) {
    console.error("Error getting current branch:", currentBranch.error);
    return { error: `Error getting current branch: ${currentBranch.error}` };
  }

  return { data: { branches: branches.data, isClean: isClean.data, currentBranch: currentBranch.data } };
}

export async function commitAll(
  repoPath: string,
  commitMessage: string,
): Promise<Result<void>> {
  try {
    await asyncExec(`cd ${repoPath} && git add .`);
    await asyncExec(`cd ${repoPath} && git commit -m "${commitMessage}"`);
    return { data: undefined };
  } catch (error) {
    console.error("Error committing changes:", error);
    return { error: `Error committing changes: ${error}` };
  }
}

export async function addAllAndDiff(
  repoPath: string,
): Promise<Result<string>> {
  try {
    await asyncExec(`cd ${repoPath} && git add .`);
    const { stdout } = await asyncExec(
      `cd ${repoPath} && git diff --staged --no-color --no-ext-diff`,
    );
    return { data: stdout.trim() };
  } catch (error) {
    console.error("Error afalse;dding files and generating diff:", error);
    return { error: `Error adding files and generating diff: ${error}` };
  }
}

export async function deleteRepo(
  repoPath: string,
): Promise<Result<void>> {
  try {
    await fs.rm(repoPath, { recursive: true });
    return { data: undefined };
  } catch (error) {
    console.error("Error deleting git repository:", error);
    return { error: `Error deleting git repository: ${error}` };
  }
}

export async function createGitRepo(
  repoPath: string,
): Promise<Result<void>> {
  try {
    await asyncExec(`cd ${repoPath} && git init && git config commit.gpgsign false`);
    return { data: undefined };
  } catch (error) {
    console.error("Error creating git repository:", error);
    return { error: `Error creating git repository: ${error}` };
  }
}

export async function isGitRepoClean(hostRepoPath: string): Promise<Result<boolean>> {
  try {
    const status = (
      await asyncExec(`cd ${hostRepoPath} && git status --porcelain`)
    ).stdout.trim();
    return { data: status.length === 0 };
  } catch (error) {
    console.error("Error checking git status:", error);
    return { error: `Error checking git status: ${error}` };
  }
}

export async function applyDiffToGitRepo(
  repoPath: string,
  diffPath: string,
): Promise<Result<void>> {
  try {
    await asyncExec(`cd ${repoPath} && git apply ${diffPath}`);
    return { data: undefined };
  } catch (error) {
    console.error("Error applying diff to git repository:", error);
    return { error: `Error applying diff to git repository: ${error}` };
  }
}

export async function restoreAllChanges(
  repoPath: string,
): Promise<Result<void>> {
  try {
    await asyncExec(`cd ${repoPath} && git restore --staged . && git restore .`);
    return { data: undefined };
  } catch (error) {
    console.error("Error restoring changes:", error);
    return { error: `Error restoring changes: ${error}` };
  }
}

// Only if there is a merge conflict that the user needs to resolve then return true.
export async function isConflictAfterApply(
  repoPath: string
): Promise<Result<boolean>> {
  try {
    const { stdout } = await asyncExec(`cd ${repoPath} && git status --porcelain`);
    const lines = stdout.trim().split("\n");

    for (const line of lines) {
      if (line.startsWith("UU")) {
        return { data: true };
      }
    }

    return { data: false };
  } catch (error) {
    console.error("Error checking for merge conflicts:", error);
    return { error: `Error checking for merge conflicts: ${error}` };
  }
}

export async function diffDirectories(
  absoluteBaseProjectPath: string,
  absoluteNewProjectPath: string
): Promise<Result<string>> {
  try {
    const { stdout } = await asyncExecFile(GENERATE_DIFF_SCRIPT_PATH, [
      absoluteBaseProjectPath,
      absoluteNewProjectPath,
    ]);

    return { data: stdout.trim() };
  } catch (error) {
    console.error("Error generating diff:", error);
    return { error: `Error generating diff: ${error}` };
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
