import * as fs from 'node:fs/promises';

export async function makeDir(path: string) {
  try {
    await fs.mkdir(path, { recursive: true });
  } finally {

  }
  console.log(`Directory created or already exists: ${path}`);
}
