import { exec, execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Template } from "../models/template";
import { GENERATE_DIFF_SCRIPT_PATH } from "../lib/env";
import { DiffHunk, GitStatus, ParsedFile, Result } from "../lib/types";
import { pathInCache } from "./cache-service";
import { logger } from "../lib/logger";
import { logError } from "../lib/utils";

const asyncExecFile = promisify(execFile);
const asyncExec = promisify(exec);

export async function switchBranch(
  repoPath: string,
  branchName: string,
): Promise<Result<void>> {
  try {
    const isClean = await isGitRepoClean(repoPath);

    if (!isClean) {
      logger.error("Cannot switch branches with uncommitted changes.");
      return {
        error: "Cannot switch branches with uncommitted changes.",
      };
    }

    await asyncExec(
      `cd ${repoPath} && git checkout ${branchName.replace("*", "").trim()}`,
    );
    return { data: undefined };
  } catch (error) {
    logError({
      shortMessage: "Error switching branches",
      error,
    })
    return {
      error: `Error switching branches: ${error}`,
    };
  }
}

/**
 * Clone a specific commit of a repo into the cache.
 *
 * @param template - a Template whose `.absoluteBaseDir` points somewhere inside the repo
 * @param revisionHash - the commit hash to checkout
 * @returns the full path to the cached repo at that revision.
 */
export async function cloneRevisionToCache(
  template: Template,
  revisionHash: string,
): Promise<Result<string>> {
  const repoDir = path.dirname(template.absoluteBaseDir); //TODO absoluteBaseDir should point to root of git dir now is root-templates.
  const repoName = path.basename(repoDir);

  const destDirName = `${repoName}-${revisionHash}`;
  const destPath = await pathInCache(destDirName);

  if ("error" in destPath) {
    return destPath;
  }

  try {
    const stat = await fs.stat(destPath.data);
    if (stat.isDirectory()) {
      return { data: destPath.data };
    }
  } catch {
  }

  try {
    await asyncExec(`git clone ${repoDir} ${destPath.data}`);
    await asyncExec(`cd ${destPath.data} && git checkout ${revisionHash}`);

    return { data: destPath.data };
  } catch (error) {
    logError({
      shortMessage: "Error cloning revision to cache",
      error,
    })
    return { error: `Error cloning revision to cache: ${error}` };
  }
}


// TODO: use to see if a project needs to be updated. Will generate a diff from old template to new project. This does require the old template somehow. So maybe we need versioning instead of hash so we can also retrieve old template and new template and we can generate the diff to update. Probably we can make a precommit tool to check which templatedirs have changes and update all those version numbers and version numbers of the parent. Probably when updating we should update entire tree at once. Think about what to allow the user to update. Make sure to enforce 1 commit 1 versionchange. So do not allow unclean git templatesdir. Then instead of saving hash to template we save commitHash.
//
// TODO so also possible to just force clean git and store commithash of template. Then can easily update all templates at once(not seperately) by just instantiating the project from this commit hash template and the new one and applying the diff. So we do not version any template but we store commit hash of entire template dir so if updated user can run update.
// Then when creating the diff if empty we just cancel and autoupdate. the template. But updating requires again the instantiation workflow for if options were added in new template.
// So updating will just be the edit workflow only when generating the baseproject for diff will not only use old settings but also old template.
//
// Git hash is stored per template but retrieved for the entire template dir. This way in future a project can combine templates from different repos.
export async function getCommitHash(repoPath: string): Promise<Result<string>> {
  try {
    const { stdout } = await asyncExec(`cd ${repoPath} && git rev-parse HEAD`);
    return { data: stdout.trim() };
  } catch (error) {
    logError({
      shortMessage: "Error getting commit hash",
      error,
    })
    return { error: `Error getting commit hash: ${error}` };
  }
}

export async function listBranches(
  repoPath: string,
): Promise<Result<string[]>> {
  try {
    const { stdout } = await asyncExec(`cd ${repoPath} && git branch --list`);
    return {
      data: stdout
        .trim()
        .split("\n")
        .map((branch) => branch.trim())
        .filter((branch) => branch.length > 0),
    };
  } catch (error) {
    logError({
      shortMessage: "Error listing branches",
      error,
    })
    return { error: `Error listing branches: ${error}` };
  }
}

export async function getCurrentBranch(
  repoPath: string,
): Promise<Result<string>> {
  try {
    const { stdout } = await asyncExec(
      `cd ${repoPath} && git rev-parse --abbrev-ref HEAD`,
    );
    return { data: stdout.trim() };
  } catch (error) {
    logError({
      shortMessage: "Error getting current branch",
      error,
    })
    return { error: `Error getting current branch: ${error}` };
  }
}

export async function loadGitStatus(
  repoPath: string,
): Promise<Result<GitStatus>> {
  const [branches, isClean, currentBranch, commitHash] = await Promise.all([
    listBranches(repoPath),
    isGitRepoClean(repoPath),
    getCurrentBranch(repoPath),
    getCommitHash(repoPath),
  ]);

  if ("error" in branches) {
    return branches;
  }

  if (branches.data.length === 0) {
    logger.error("No branches found or error listing branches.");
    return { error: "No branches found or error listing branches." };
  }

  if ("error" in isClean) {
    return isClean;
  }

  if ("error" in currentBranch) {
    return currentBranch;
  }

  if ("error" in commitHash) {
    return commitHash;
  }

  return {
    data: {
      branches: branches.data,
      isClean: isClean.data,
      currentBranch: currentBranch.data,
      currentCommitHash: commitHash.data,
    },
  };
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
    logError({
      shortMessage: "Error committing changes",
      error,
    })
    return { error: `Error committing changes: ${error}` };
  }
}

export async function addAllAndDiff(repoPath: string): Promise<Result<string>> {
  try {
    await asyncExec(`cd ${repoPath} && git add .`);
    const { stdout } = await asyncExec(
      `cd ${repoPath} && git diff --staged --no-color --no-ext-diff`,
    );
    return { data: stdout.trim() };
  } catch (error) {
    logError({
      shortMessage: "Error adding files and generating diff",
      error,
    })
    return { error: `Error adding files and generating diff: ${error}` };
  }
}

export async function deleteRepo(repoPath: string): Promise<Result<void>> {
  try {
    await fs.rm(repoPath, { recursive: true });
    return { data: undefined };
  } catch (error) {
    logError({
      shortMessage: "Error deleting git repository",
      error,
    })
    return { error: `Error deleting git repository: ${error}` };
  }
}

export async function createGitRepo(repoPath: string): Promise<Result<void>> {
  try {
    await asyncExec(
      `cd ${repoPath} && git init && git config commit.gpgsign false`,
    );
    return { data: undefined };
  } catch (error) {
    logError({
      shortMessage: "Error creating git repository",
      error,
    })
    return { error: `Error creating git repository: ${error}` };
  }
}

export async function isGitRepoClean(
  hostRepoPath: string,
): Promise<Result<boolean>> {
  try {
    const status = (
      await asyncExec(`cd ${hostRepoPath} && git status --porcelain`)
    ).stdout.trim();
    return { data: status.length === 0 };
  } catch (error) {
    logError({
      shortMessage: "Error checking git status",
      error,
    })
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
    logError({
      shortMessage: "Error applying diff to git repository",
      error,
    })
    return { error: `Error applying diff to git repository: ${error}` };
  }
}

// TODO: should add a question to the user if they want to reset all changes before they can go back from the applied diff to diff to apply. otherwise user might remove changes by accident
export async function resetAllChanges(repoPath: string): Promise<Result<void>> {
  try {
    await asyncExec(`cd ${repoPath} && git reset --hard`);
    return { data: undefined };
  } catch (error) {
    logError({
      shortMessage: "Error resetting all changes",
      error,
    })
    return { error: `Error restoring changes: ${error}` };
  }
}

// Only if there is a merge conflict that the user needs to resolve then return true.
export async function isConflictAfterApply(
  repoPath: string,
): Promise<Result<boolean>> {
  try {
    const { stdout } = await asyncExec(
      `cd ${repoPath} && git status --porcelain`,
    );
    const lines = stdout.trim().split("\n");

    for (const line of lines) {
      if (line.startsWith("UU")) {
        return { data: true };
      }
    }

    return { data: false };
  } catch (error) {
    logError({
      shortMessage: "Error checking for merge conflicts",
      error,
    })
    return { error: `Error checking for merge conflicts: ${error}` };
  }
}

export async function diffDirectories(
  absoluteBaseProjectPath: string,
  absoluteNewProjectPath: string,
): Promise<Result<string>> {
  try {
    const { stdout } = await asyncExecFile(GENERATE_DIFF_SCRIPT_PATH, [
      absoluteBaseProjectPath,
      absoluteNewProjectPath,
    ]);

    return { data: stdout.trim() };
  } catch (error) {
    logError({
      shortMessage: "Error generating diff",
      error,
    });
    return { error: `Error generating diff: ${error}` };
  }
}

export function parseGitDiff(diffText: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  const lines = diffText.split("\n");

  let currentFile: ParsedFile | null = null;
  let currentHunk: DiffHunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Start of a new file diff
    if (line.startsWith("diff --git")) {
      // Push previous hunk if it exists
      if (currentHunk && currentFile) {
        currentFile.hunks.push(currentHunk);
        currentHunk = null;
      }

      // Push previous file if it exists
      if (currentFile) {
        files.push(currentFile);
      }

      // Extract file path
      const match = line.match(/diff --git a\/(.+?) b\/(.+)/);
      if (match) {
        currentFile = {
          path: match[1]!,
          status: "modified", // default, may change
          hunks: [],
        };
      }
    }

    // File status lines
    else if (line.startsWith("new file")) {
      if (currentFile) currentFile.status = "added";
    } else if (line.startsWith("deleted file")) {
      if (currentFile) currentFile.status = "deleted";
    }

    // Start of a hunk
    else if (line.startsWith("@@")) {
      // Push previous hunk
      if (currentHunk && currentFile) {
        currentFile.hunks.push(currentHunk);
      }

      const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (match) {
        currentHunk = {
          oldStart: parseInt(match[1]!, 10),
          oldLines: parseInt(match[2] || "1", 10),
          newStart: parseInt(match[3]!, 10),
          newLines: parseInt(match[4] || "1", 10),
          lines: [],
        };
      }
    }

    // Diff lines (+, -, or context)
    else if (currentHunk && /^[ +-]/.test(line)) {
      currentHunk.lines.push(line);
    }
  }

  // Push any remaining hunk and file
  if (currentHunk && currentFile) {
    currentFile.hunks.push(currentHunk);
  }

  if (currentFile) {
    files.push(currentFile);
  }

  return files;
}
