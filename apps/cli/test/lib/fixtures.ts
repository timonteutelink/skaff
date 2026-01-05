import {execFile} from 'node:child_process'
import {mkdtemp, mkdir, readFile, symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

type WorkspaceFixture = {
  root: string
  binDir: string
  cacheDir: string
  configDir: string
}

async function resolveBinaryPath(command: string): Promise<string> {
  const {stdout} = await execFileAsync('which', [command])
  return stdout.trim()
}

export async function createWorkspaceFixture(): Promise<WorkspaceFixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'skaff-cli-'))
  const binDir = path.join(root, 'bin')
  const cacheDir = path.join(root, 'cache')
  const configDir = path.join(root, 'config')
  await mkdir(binDir, {recursive: true})
  await mkdir(cacheDir, {recursive: true})
  await mkdir(configDir, {recursive: true})

  const gitPath = await resolveBinaryPath('git')
  const catPath = await resolveBinaryPath('cat')
  await symlink(gitPath, path.join(binDir, 'git'))
  await symlink(catPath, path.join(binDir, 'cat'))

  return {root, binDir, cacheDir, configDir}
}

export async function withEnv<T>(
  overrides: NodeJS.ProcessEnv,
  fn: () => Promise<T> | T,
): Promise<T> {
  const originalEnv = {...process.env}
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return await fn()
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key]
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value
    }
  }
}

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw) as T
}
