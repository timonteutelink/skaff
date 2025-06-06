import { getProjectFromPath, Project, Result } from "@timonteutelink/code-templator-lib";
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const DEFAULT_FORMAT = "table" as const;
export type Format = "json" | "ndjson" | "table" | "tsv";

export function printFormatted<T extends Record<string, unknown>>(
  data: T | T[],
  format: Format = DEFAULT_FORMAT,
) {
  switch (format) {
    case "json": {
      console.log(JSON.stringify(data, null, 2));
      break;
    }

    case "ndjson": {
      for (const o of (Array.isArray(data) ? data : [data])) console.log(JSON.stringify(o))
        ;
      break;
    }

    case "tsv": {
      const rows = Array.isArray(data) ? data : [data];
      const keys = Object.keys(rows[0] ?? {});
      console.log(keys.join("\t"));
      for (const r of rows) console.log(
        keys
          .map((k) => String(r[k] ?? "").replaceAll(/[\t\r\n]+/g, " "))
          .join("\t"),
      )
        ;
      break;
    }

    default: {
      console.table(data);
    }
  }
}

export async function findProjectDirPath(startDir?: string): Promise<null | string> {
  let currentDir = startDir ? path.resolve(startDir) : process.cwd();

  while (true) {
    const targetPath = path.join(currentDir, 'templateSettings.json');

    try {
      await fs.access(targetPath);
      return currentDir;
    } catch {
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }

    currentDir = parentDir;
  }

  return null;
}

export async function getCurrentProject(): Promise<Result<null | Project>> {
  const projectDir = await findProjectDirPath();
  if (!projectDir) {
    return { error: "No project found in the current directory or its parents." };
  }

  return getProjectFromPath(projectDir);
}
