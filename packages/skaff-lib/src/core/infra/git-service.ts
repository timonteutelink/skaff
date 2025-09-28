import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import fsExtra from "fs-extra";
import simpleGit from "simple-git";
import { delay, inject, injectable } from "tsyringe";

import { getSkaffContainer } from "../../di/container";
import { DiffHunk, GitStatus, ParsedFile, Result } from "../../lib/types";
import { logError } from "../../lib/utils";
import type { Template } from "../templates";
import { CacheService } from "./cache-service";
import { NpmService } from "./npm-service";

type PossibleGitError = {
  exitCode?: number;
  message?: string;
  git?: {
    exitCode?: number;
    stderr?: string;
    stdErr?: string;
  };
};

@injectable()
export class GitService {
  constructor(
    @inject(delay(() => CacheService))
    private readonly cacheService: CacheService,
    @inject(delay(() => NpmService)) private readonly npmService: NpmService,
  ) {}

  private gitClient(repoPath?: string) {
    return repoPath ? simpleGit({ baseDir: repoPath }) : simpleGit();
  }

  private sanitizeBranchName(branchName: string): string {
    return branchName.replace("*", "").trim();
  }

  private isNotRepoError(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
      return false;
    }

    const possibleGitError = error as PossibleGitError;
    const exitCode =
      possibleGitError.exitCode ?? possibleGitError.git?.exitCode ?? null;

    if (exitCode === 128) {
      return true;
    }

    const message =
      possibleGitError.message ??
      possibleGitError.git?.stderr ??
      possibleGitError.git?.stdErr ??
      "";

    if (typeof message === "string" && message.length > 0) {
      const normalizedMessage = message.toLowerCase();
      return (
        normalizedMessage.includes("not a git repository") ||
        normalizedMessage.includes("is not a git repository")
      );
    }

    return false;
  }

  private createGitDirectoryFilter(
    sourceRoot: string,
  ): (src: string) => boolean {
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

  private async removeAllExceptGit(dir: string): Promise<void> {
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

  public async isGitRepo(dir: string): Promise<Result<boolean>> {
    try {
      const git = this.gitClient(dir);
      const isRepo = await git.checkIsRepo();
      return { data: isRepo };
    } catch (err: unknown) {
      if (this.isNotRepoError(err)) {
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

  public async switchBranch(
    repoPath: string,
    branchName: string,
  ): Promise<Result<void>> {
    const cleanResult = await this.isGitRepoClean(repoPath);

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
      const git = this.gitClient(repoPath);
      await git.checkout(this.sanitizeBranchName(branchName));
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

  public async cloneRepoBranchToCache(
    repoUrl: string,
    branch: string,
  ): Promise<Result<string>> {
    const repoName = path.basename(repoUrl).replace(/\.git$/, "");
    const normalizedBranch = this.sanitizeBranchName(branch);
    const revisionHash = await this.getRemoteCommitHash(
      repoUrl,
      normalizedBranch,
    );
    if ("error" in revisionHash) {
      return revisionHash;
    }
    const destDirName = `${repoName}-${normalizedBranch}-${revisionHash.data}`;
    const destPath = await this.cacheService.pathInCache(destDirName);
    if ("error" in destPath) {
      return destPath;
    }
    try {
      const stat = await fs.stat(destPath.data).catch(() => null);

      if (stat && stat.isDirectory()) {
        const git = this.gitClient(destPath.data);
        await git.fetch();
        await git.checkout(normalizedBranch);
        await git.pull();
        const installResult = await this.npmService.install(destPath.data);
        if ("error" in installResult) {
          return { error: installResult.error };
        }
        return { data: destPath.data };
      }
      await this.gitClient().clone(repoUrl, destPath.data, [
        "--branch",
        normalizedBranch,
      ]);
      const git = this.gitClient(destPath.data);
      await git.checkout(normalizedBranch);
      const installResult = await this.npmService.install(destPath.data);
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

  public async cloneRevisionToCache(
    template: Template,
    revisionHash: string,
  ): Promise<Result<string>> {
    const repoDir = path.dirname(template.absoluteBaseDir); //TODO absoluteBaseDir should point to root of git dir now is root-templates.
    const repoName = path.basename(repoDir);

    const destDirName = `${repoName}-${revisionHash}`;
    const destPath = await this.cacheService.pathInCache(destDirName);

    if ("error" in destPath) {
      return destPath;
    }

    try {
      const stat = await fs.stat(destPath.data).catch(() => null);
      if (stat && stat.isDirectory()) {
        return { data: destPath.data };
      }

      await this.gitClient().clone(repoDir, destPath.data);
      const git = this.gitClient(destPath.data);
      await git.checkout(revisionHash);
      const installResult = await this.npmService.install(destPath.data);
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

  public async getCommitHash(repoPath: string): Promise<Result<string>> {
    try {
      const git = this.gitClient(repoPath);
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

  public async listBranches(repoPath: string): Promise<Result<string[]>> {
    try {
      const git = this.gitClient(repoPath);
      const branches = await git.branchLocal();
      return {
        data: branches.all
          .map((branch) => branch.trim())
          .filter((branch) => branch.length > 0),
      };
    } catch (error) {
      logError({
        shortMessage: "Error listing branches",
        error,
      });
      return { error: `Error listing branches: ${error}` };
    }
  }

  public async getCurrentBranch(repoPath: string): Promise<Result<string>> {
    try {
      const git = this.gitClient(repoPath);
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

  public async getRemoteCommitHash(
    repoUrl: string,
    branch: string,
  ): Promise<Result<string>> {
    try {
      const git = this.gitClient();
      const stdout = await git.raw([
        "ls-remote",
        repoUrl,
        this.sanitizeBranchName(branch),
      ]);
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

  public async loadGitStatus(repoPath: string): Promise<Result<GitStatus>> {
    const [branches, isClean, currentBranch, commitHash] = await Promise.all([
      this.listBranches(repoPath),
      this.isGitRepoClean(repoPath),
      this.getCurrentBranch(repoPath),
      this.getCommitHash(repoPath),
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

  public async commitAll(
    repoPath: string,
    commitMessage: string,
  ): Promise<Result<void>> {
    try {
      const git = this.gitClient(repoPath);
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

  public async addAllAndRetrieveDiff(
    repoPath: string,
  ): Promise<Result<string>> {
    try {
      const git = this.gitClient(repoPath);
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

  public async deleteRepo(repoPath: string): Promise<Result<void>> {
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

  public async createGitRepo(repoPath: string): Promise<Result<void>> {
    try {
      const git = this.gitClient(repoPath);
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

  public async isGitRepoClean(hostRepoPath: string): Promise<Result<boolean>> {
    try {
      const git = this.gitClient(hostRepoPath);
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

  public async applyDiffToGitRepo(
    repoPath: string,
    diffPath: string,
  ): Promise<Result<void>> {
    try {
      const git = this.gitClient(repoPath);
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

  public async resetAllChanges(repoPath: string): Promise<Result<void>> {
    try {
      const git = this.gitClient(repoPath);
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

  public async isConflictAfterApply(
    repoPath: string,
  ): Promise<Result<boolean>> {
    try {
      const git = this.gitClient(repoPath);
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

  public async diffDirectories(
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
        filter: this.createGitDirectoryFilter(baseProject),
      });

      const git = this.gitClient(tempDir);
      await git.init();
      await git.addConfig("commit.gpgsign", "false");
      await git.addConfig("user.name", "Skaff Diff Bot");
      await git.addConfig("user.email", "skaff-diff@example.com");
      await git.add(".");
      await git.commit("Base version");

      await this.removeAllExceptGit(tempDir);
      await fsExtra.copy(changedProject, tempDir, {
        overwrite: true,
        errorOnExist: false,
        filter: this.createGitDirectoryFilter(changedProject),
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

  public parseGitDiff(diffText: string): ParsedFile[] {
    const files: ParsedFile[] = [];
    const lines = diffText.split("\n");

    let currentFile: ParsedFile | null = null;
    let currentHunk: DiffHunk | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      if (line.startsWith("diff --git")) {
        if (currentHunk && currentFile) {
          currentFile.hunks.push(currentHunk);
          currentHunk = null;
        }

        if (currentFile) {
          files.push(currentFile);
        }

        const match = line.match(/diff --git a\/(.+?) b\/(.+)/);
        if (match) {
          currentFile = {
            path: match[1]!,
            status: "modified",
            hunks: [],
          };
        }
      } else if (line.startsWith("new file")) {
        if (currentFile) currentFile.status = "added";
      } else if (line.startsWith("deleted file")) {
        if (currentFile) currentFile.status = "deleted";
      } else if (line.startsWith("@@")) {
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
      } else if (currentHunk && /^[ +-]/.test(line)) {
        currentHunk.lines.push(line);
      }
    }

    if (currentHunk && currentFile) {
      currentFile.hunks.push(currentHunk);
    }

    if (currentFile) {
      files.push(currentFile);
    }

    return files;
  }
}

export function resolveGitService(): GitService {
  return getSkaffContainer().resolve(GitService);
}
