
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { pathInCache } from "../../../../packages/code-templator-lib/dist/services/cache-service";

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

export async function viewPatchWithGit(projectCommitHash: string, options: {
  tool?: 'less' | 'bat' | 'delta' | 'diff-so-fancy' | 'git-split-diffs';
  output?: string;
} = {}): Promise<void> {
  const patchFile = await pathInCache(`patch-${projectCommitHash}.patch`);
  if ('error' in patchFile) {
    console.error('Error getting patch file path:', patchFile.error);
    return;
  }
  try {
    if (options.tool) {
      await openWithTool(patchFile.data, options.tool);
    } else {
      await openWithBestAvailableTool(patchFile.data);
    }
  } catch (error) {
    console.error('Error opening patch file:', error);
    console.log(`Patch file saved to: ${patchFile.data}`);
    console.log('You can view it with: git apply --check <file> or any diff viewer');
  }
}

/**
 * Try to open with the best available tool
 */
async function openWithBestAvailableTool(patchFile: string): Promise<void> {
  const tools = [
    { name: 'delta', cmd: `delta "${patchFile}"` },
    { name: 'diff-so-fancy', cmd: `diff-so-fancy < "${patchFile}"` },
    { name: 'git-split-diffs', cmd: `git-split-diffs --color=always < "${patchFile}"` },
    { name: 'bat', cmd: `bat --language=diff "${patchFile}"` },
    { name: 'less', cmd: `less -R "${patchFile}"` },
    { name: 'cat', cmd: `cat "${patchFile}"` }
  ];

  for (const tool of tools) {
    if (await isCommandAvailable(tool.name)) {
      console.log(`Opening diff with ${tool.name}...`);
      execSync(tool.cmd, { stdio: 'inherit' });
      return;
    }
  }

  throw new Error('No suitable diff viewer found');
}

async function execWithInheritedStdio(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = exec(command, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });

    // Inherit stdio
    if (child.stdout) child.stdout.pipe(process.stdout);
    if (child.stderr) child.stderr.pipe(process.stderr);
    if (process.stdin) process.stdin.pipe(child.stdin!);
  });
}

/**
 * Open with a specific tool
 */
async function openWithTool(patchFile: string, tool: string): Promise<void> {
  const commands: Record<string, string> = {
    'less': `less -R "${patchFile}"`,
    'bat': `bat --language=diff "${patchFile}"`,
    'delta': `delta "${patchFile}"`,
    'diff-so-fancy': `diff-so-fancy < "${patchFile}"`,
    'git-split-diffs': `git-split-diffs --color=always < "${patchFile}"`
  };

  const cmd = commands[tool];
  if (!cmd) {
    throw new Error(`Unknown tool: ${tool}`);
  }

  if (!(await isCommandAvailable(tool))) {
    throw new Error(`Tool not available: ${tool}`);
  }

  execSync(cmd, { stdio: 'inherit' });
}

async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
