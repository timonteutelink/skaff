import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import fsExtra from "fs-extra";
import simpleGit from "simple-git";

import { DiffHunk, GitStatus, ParsedFile, Result } from "../lib/types";
import { logError } from "../lib/utils";
import { Template } from "../models/template";
import { pathInCache } from "./cache-service";
import { npmInstall } from "./npm-service";

function gitClient(repoPath?: string) {
  return repoPath ? simpleGit({ baseDir: repoPath }) : simpleGit();
}

function sanitizeBranchName(branchName: string): string {
  return branchName.replace("*", "").trim();
}

function isNotRepoError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const possibleGitError = error as { exitCode?: number; message?: string };

  if (possibleGitError.exitCode === 128) {
    return true;
  }

  if (typeof possibleGitError.message === "string") {
    const message = possibleGitError.message.toLowerCase();
    return (
      message.includes("not a git repository") ||
      message.includes("is not a git repository")
    );
  }

  return false;
}

function createGitDirectoryFilter(sourceRoot: string): (src: string) => boolean {
  const normalizedRoot = path.resolve(sourceRoot);

  return (src: string): boolean => {
    const absoluteSrc = path.resolve(src);
    const relative = path.relative(normalizedRoot, absoluteSrc);

    if (!relative || relative.startsWith("..")) {
      return true;
    }

    return !relative.split(path.sep).includes(".git");
  };
}

async function removeAllExceptGit(dir: string): Promise<void> {
  const entries = await fs.readdir(dir);

  await Promise.all(
    entries.map(async (entry) => {
      if (entry === ".git") {
        return;
      }

      await fsExtra.remove(path.join(dir, entry));
    }),
  );
}

export async function isGitRepo(dir: string): Promise<Result<boolean>> {
  try {
    const git = gitClient(dir);
    const isRepo = await git.checkIsRepo();
    return { data: isRepo };
  } catch (err: unknown) {
    if (isNotRepoError(err)) {
      return { data: false };
    }

    logError({
      shortMessage: "Error checking if path is a git repository",
      error: err,
    });
    return {
      error: `Error checking if path is a git repository: ${String(err)}`,
    };
  }
}

export async function switchBranch(
  repoPath: string,
  branchName: string,
): Promise<Result<void>> {
  const cleanResult = await isGitRepoClean(repoPath);

  if ("error" in cleanResult) {
    return { error: cleanResult.error };
  }

  if (!cleanResult.data) {
    logError({
      shortMessage: "Cannot switch branches with uncommitted changes.",
    });
    return {
      error: "Cannot switch branches with uncommitted changes.",
    };
  }

  try {
    const git = gitClient(repoPath);
    await git.checkout(sanitizeBranchName(branchName));
    return { data: undefined };
  } catch (error) {
    logError({
      shortMessage: "Error switching branches",
      error,
    });
    return {
      error: `Error switching branches: ${error}`,
    };
  }
}

export async function cloneRepoBranchToCache(
  repoUrl: string,
  branch: string,
): Promise<Result<string>> {
  const repoName = path.basename(repoUrl).replace(/\.git$/, "");
  const revisionHash = await getRemoteCommitHash(repoUrl, branch);
  if ("error" in revisionHash) {
    return revisionHash;
  }
  const destDirName = `${repoName}-${branch}-${revisionHash.data}`;
  const destPath = await pathInCache(destDirName);
  if ("error" in destPath) {
    return destPath;
  }
  try {
    const stat = await fs.stat(destPath.data).catch(() => null);
    const normalizedBranch = sanitizeBranchName(branch);

    if (stat && stat.isDirectory()) {
      const git = gitClient(destPath.data);
      await git.fetch();
      await git.checkout(normalizedBranch);
      await git.pull();
      const installResult = await npmInstall(destPath.data);
      if ("error" in installResult) {
        return { error: installResult.error };
      }
      return { data: destPath.data };
    }
    await gitClient().clone(repoUrl, destPath.data, ["--branch", normalizedBranch]);
    const git = gitClient(destPath.data);
    await git.checkout(normalizedBranch);
    const installResult = await npmInstall(destPath.data);
    if ("error" in installResult) {
      return { error: installResult.error };
    }
    return { data: destPath.data };
  } catch (error) {
    logError({
      shortMessage: "Error cloning repo to cache",
      error,
    });
    return { error: `Error cloning repo to cache: ${error}` };
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
    const stat = await fs.stat(destPath.data).catch(() => null);
    if (stat && stat.isDirectory()) {
      return { data: destPath.data };
    }

    await gitClient().clone(repoDir, destPath.data);
    const git = gitClient(destPath.data);
    await git.checkout(revisionHash);
    const installResult = await npmInstall(destPath.data);
    if ("error" in installResult) {
      return { error: installResult.error };
    }

    return { data: destPath.data };
  } catch (error) {
    logError({
      shortMessage: "Error cloning revision to cache",
      error,
    });
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
    const git = gitClient(repoPath);
    const hash = await git.revparse(["HEAD"]);
    return { data: hash.trim() };
  } catch (error) {
    logError({
      shortMessage: "Error getting commit hash",
      error,
    });
    return { error: `Error getting commit hash: ${error}` };
  }
}

export async function listBranches(
  repoPath: string,
): Promise<Result<string[]>> {
  try {
    const git = gitClient(repoPath);
    const branches = await git.branchLocal();
    return {
      data: branches.all.map((branch) => branch.trim()).filter((branch) => branch.length > 0),
    };
  } catch (error) {
    logError({
      shortMessage: "Error listing branches",
      error,
    });
    return { error: `Error listing branches: ${error}` };
  }
}

export async function getCurrentBranch(
  repoPath: string,
): Promise<Result<string>> {
  try {
    const git = gitClient(repoPath);
    const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
    return { data: branch.trim() };
  } catch (error) {
    logError({
      shortMessage: "Error getting current branch",
      error,
    });
    return { error: `Error getting current branch: ${error}` };
  }
}

export async function getRemoteCommitHash(
  repoUrl: string,
  branch: string,
): Promise<Result<string>> {
  try {
    const git = gitClient();
    const stdout = await git.raw(["ls-remote", repoUrl, branch]);
    const hash = stdout.split("\t")[0]?.trim();
    if (!hash) {
      return { error: "Failed to retrieve remote commit hash" };
    }
    return { data: hash };
  } catch (error) {
    logError({ shortMessage: "Error getting remote commit hash", error });
    return { error: `Error getting remote commit hash: ${error}` };
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
    logError({ shortMessage: "No branches found or error listing branches." });
    return { error: "No branches found or error listing branches." };
  }

  if ("error" in isClean) {
    return { error: isClean.error };
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
    const git = gitClient(repoPath);
    await git.add(".");
    await git.commit(commitMessage);
    return { data: undefined };
  } catch (error) {
    logError({
      shortMessage: "Error committing changes",
      error,
    });
    return { error: `Error committing changes: ${error}` };
  }
}

export async function addAllAndRetrieveDiff(
  repoPath: string,
): Promise<Result<string>> {
  try {
    const git = gitClient(repoPath);
    await git.add(".");
    const diff = await git.diff(["--staged", "--no-color", "--no-ext-diff"]);
    return { data: diff.trim() };
  } catch (error) {
    logError({
      shortMessage: "Error adding files and generating diff",
      error,
    });
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
    });
    return { error: `Error deleting git repository: ${error}` };
  }
}

export async function createGitRepo(repoPath: string): Promise<Result<void>> {
  try {
    const git = gitClient(repoPath);
    await git.init();
    await git.addConfig("commit.gpgsign", "false");
    return { data: undefined };
  } catch (error) {
    logError({
      shortMessage: "Error creating git repository",
      error,
    });
    return { error: `Error creating git repository: ${error}` };
  }
}

export async function isGitRepoClean(
  hostRepoPath: string,
): Promise<Result<boolean>> {
  try {
    const git = gitClient(hostRepoPath);
    const status = await git.status();
    return { data: status.isClean() };
  } catch (error) {
    logError({
      shortMessage: "Error checking git status",
      error,
    });
    return { error: `Error checking git status: ${error}` };
  }
}

export async function applyDiffToGitRepo(
  repoPath: string,
  diffPath: string,
): Promise<Result<void>> {
  try {
    const git = gitClient(repoPath);
    await git.raw(["apply", diffPath]);
    return { data: undefined };
  } catch (error) {
    logError({
      shortMessage: "Error applying diff to git repository",
      error,
    });
    return { error: `Error applying diff to git repository: ${error}` };
  }
}

// TODO: should add a question to the user if they want to reset all changes before they can go back from the applied diff to diff to apply. otherwise user might remove changes by accident
export async function resetAllChanges(repoPath: string): Promise<Result<void>> {
  try {
    const git = gitClient(repoPath);
    await git.raw(["reset", "--hard"]);
    return { data: undefined };
  } catch (error) {
    logError({
      shortMessage: "Error resetting all changes",
      error,
    });
    return { error: `Error restoring changes: ${error}` };
  }
}

// Only if there is a merge conflict that the user needs to resolve then return true.
export async function isConflictAfterApply(
  repoPath: string,
): Promise<Result<boolean>> {
  try {
    const git = gitClient(repoPath);
    const status = await git.status();
    return { data: status.conflicted.length > 0 };
  } catch (error) {
    logError({
      shortMessage: "Error checking for merge conflicts",
      error,
    });
    return { error: `Error checking for merge conflicts: ${error}` };
  }
}

export async function diffDirectories(
  absoluteBaseProjectPath: string,
  absoluteNewProjectPath: string,
): Promise<Result<string>> {
  const baseProject = path.resolve(absoluteBaseProjectPath);
  const changedProject = path.resolve(absoluteNewProjectPath);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "skaff-diff-"));

  try {
    await fsExtra.copy(baseProject, tempDir, {
      overwrite: true,
      errorOnExist: false,
      filter: createGitDirectoryFilter(baseProject),
    });

    const git = gitClient(tempDir);
    await git.init();
    await git.addConfig("commit.gpgsign", "false");
    await git.add(".");
    await git.commit("Base version");

    await removeAllExceptGit(tempDir);
    await fsExtra.copy(changedProject, tempDir, {
      overwrite: true,
      errorOnExist: false,
      filter: createGitDirectoryFilter(changedProject),
    });

    await git.add(".");
    const diff = await git.diff(["--staged", "--no-color", "--no-ext-diff"]);

    return { data: diff.trim() };
  } catch (error) {
    logError({
      shortMessage: "Error generating diff between directories",
      error,
    });
    return { error: `Error generating diff between directories: ${error}` };
  } finally {
    await fsExtra.remove(tempDir);
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
