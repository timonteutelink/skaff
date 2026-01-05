import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { registerCleanup } from "../helpers/template-fixtures";

export interface TempDirFixture {
  root: string;
  cleanup: () => Promise<void>;
}

export async function createTempDir(prefix: string): Promise<TempDirFixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const cleanup = registerCleanup(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  return { root, cleanup };
}

export interface TemplateFileTreeOptions {
  root: string;
  files?: Record<string, string>;
  configContents?: string;
}

export async function writeTemplateFileTree({
  root,
  files = { "index.hbs": "hello" },
  configContents = "export default {};",
}: TemplateFileTreeOptions): Promise<{
  filesDir: string;
  configPath: string;
}> {
  const filesDir = path.join(root, "files");
  await fs.mkdir(filesDir, { recursive: true });

  for (const [relativePath, contents] of Object.entries(files)) {
    const destination = path.join(filesDir, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, contents, "utf8");
  }

  const configPath = path.join(root, "templateConfig.ts");
  await fs.writeFile(configPath, configContents, "utf8");

  return { filesDir, configPath };
}
