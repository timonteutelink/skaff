import type { CacheKey } from "@timonteutelink/code-templator-lib";

import { DiffHunk, ParsedFile, pathInCache, saveToCache } from '@timonteutelink/code-templator-lib';
import { exec } from "node:child_process";
import nodeCrypto from "node:crypto";
import fs from "node:fs/promises";
import { promisify } from "node:util";

const asyncExec = promisify(exec);

async function execWithInheritedStdio(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = exec(command, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });

    if (child.stdout) child.stdout.pipe(process.stdout);
    if (child.stderr) child.stderr.pipe(process.stderr);
    if (process.stdin) process.stdin.pipe(child.stdin!);
  });
}


function hashDiffText(diffText: string): string {
  return nodeCrypto.createHash('sha256').
    update(diffText)
    .digest('hex');
}

// 'less' | 'bat' | 'delta' | 'diff-so-fancy' | 'git-split-diffs';

function serializeParsedFiles(files: ParsedFile[]): string {
  const lines: string[] = [];

  for (const file of files) {
    // Header -------------------------------------------------------------
    lines.push(`diff --git a/${file.path} b/${file.path}`);

    // File-level status lines
    switch (file.status) {
      case "added": {
        lines.push("new file mode 100644");
        break;
      }

      case "deleted": {
        lines.push("deleted file mode 100644");
        break;
      }
      /* ‘modified’ needs no extra header */
    }

    // --- / +++ header lines
    const lhs = file.status === "added" ? "/dev/null" : `a/${file.path}`;
    const rhs = file.status === "deleted" ? "/dev/null" : `b/${file.path}`;
    lines.push(`--- ${lhs}`, `+++ ${rhs}`);

    // Hunks --------------------------------------------------------------
    file.hunks.forEach((h: DiffHunk) => {
      lines.push(
        `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`, ...h.lines
      );
    });

    // Blank line between files
    lines.push("");
  }

  return lines.join("\n");
}

export async function viewParsedDiffWithGit(
  parsed: ParsedFile[],
  options: { tool?: string } = {},
): Promise<void> {
  const diffText = serializeParsedFiles(parsed);

  const cacheId = hashDiffText(diffText);

  const tempFile = await saveToCache('temp-diff', cacheId, 'patch', diffText);
  if ('error' in tempFile) {
    console.error('Error saving diff to cache:', tempFile.error);
    return;
  }

  await fs.writeFile(tempFile.data, diffText, "utf8");

  try {
    await openWithTool(tempFile.data, options.tool);
  } catch (error) {
    console.error("Error opening diff:", error);
    console.log("Fallback: cat", tempFile);
    await execWithInheritedStdio(`cat "${tempFile}"`);
  }
}

export async function viewExistingPatchWithGit(cacheKey: CacheKey, projectCommitHash: string, options: {
  output?: string;
  tool?: string
} = {}): Promise<void> {
  const patchFile = await pathInCache(`${cacheKey}-${projectCommitHash}.patch`);
  if ('error' in patchFile) {
    console.error('Error getting patch file path:', patchFile.error);
    return;
  }

  try {
    await (options.tool ? openWithTool(patchFile.data, options.tool) : openWithTool(patchFile.data));
  } catch (error) {
    console.error('Error opening patch file:', error);
    console.log(`Patch file saved to: ${patchFile.data}`);
    console.log('You can view it with: git apply --check <file> or any diff viewer');
  }
}

/**
 * Open with a specific tool
 */
async function openWithTool(patchFile: string, tool?: string): Promise<void> {
  const tools = [
    { cmd: `delta "${patchFile}"`, name: 'delta' },
    { cmd: `diff-so-fancy < "${patchFile}"`, name: 'diff-so-fancy' },
    { cmd: `git-split-diffs --color=always < "${patchFile}"`, name: 'git-split-diffs' },
    { cmd: `bat --language=diff "${patchFile}"`, name: 'bat' },
    { cmd: `less -R "${patchFile}"`, name: 'less' },
    { cmd: `cat "${patchFile}"`, name: 'cat' }
  ];

  if (tool) {
    if (!(await isCommandAvailable(tool))) {
      throw new Error(`Tool not available: ${tool}`);
    }

    const cmd = tools.find(t => t.name === tool);

    if (!cmd) {
      throw new Error(`Problem occured`);
    }

    execWithInheritedStdio(cmd.cmd);
  }

  for (const tool of tools) {
    if (await isCommandAvailable(tool.name)) {
      console.log(`Opening diff with ${tool.name}...`);
      execWithInheritedStdio(tool.cmd);
      return;
    }
  }

  throw new Error('No suitable diff viewer found');
}

async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    await asyncExec(`which ${command}`);
    return true;
  } catch {
    return false;
  }
}
