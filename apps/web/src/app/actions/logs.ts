"use server";

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import prettyPrint from "pino-pretty";
import type { Level, LogEvent } from "pino";
import { Result } from "@timonteutelink/code-templator-lib/lib/types";
import { getCacheDirPath } from "@timonteutelink/code-templator-lib/services/cache-service";
import { serverLogger } from "@timonteutelink/code-templator-lib/lib/logger";
import { LEVEL_NAMES, LogFilter, LogJSON } from "@/lib/types";
import { logError } from "@timonteutelink/code-templator-lib/lib/utils";

export async function fetchLogs(
  filter: LogFilter,
): Promise<Result<LogJSON[] | string>> {
  const {
    levels,
    src,
    q,
    from,
    to,
    file = new Date().toISOString().slice(0, 10),
    pretty = false,
    limit = 500,
  } = filter;

  const fromMs = from ? Date.parse(from) : null;
  const toMs = to ? Date.parse(to) : null;

  const logPath = path.join(
    getCacheDirPath(),
    "logs",
    `code-templator.${file}.log`,
  );

  try {
    await fs.promises.access(logPath, fs.constants.R_OK);
  } catch {
    return { data: [] };
  }

  const rli = readline.createInterface({
    input: fs.createReadStream(logPath, { encoding: "utf8" }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  const matches: LogJSON[] = [];

  for await (const line of rli) {
    if (!line.trim()) continue;

    let obj: LogJSON;
    try {
      obj = JSON.parse(line);
    } catch {
      continue; // skip corrupted
    }

    if (levels?.length && !levels.includes(LEVEL_NAMES[obj.level]!)) continue;
    if (src?.length && !src.includes((obj.src ?? "backend") as any)) continue;
    if (fromMs !== null && obj.time < fromMs) continue;
    if (toMs !== null && obj.time > toMs) continue;
    if (q && !JSON.stringify(obj).toLowerCase().includes(q.toLowerCase()))
      continue;

    matches.push(obj);
    if (matches.length >= limit) break;
  }

  rli.close();

  if (!pretty) {
    return { data: matches.reverse() }; // newest first
  }

  const stream = prettyPrint({
    colorize: false,
    sync: true,
    translateTime: "SYS:standard",
  });

  return {
    data: matches.map((m) => stream.write(JSON.stringify(m)) || "").join(""),
  };
}

export async function logFromClient(data: {
  level: Level;
  msg: string;
  meta?: LogEvent;
}): Promise<Result<boolean>> {
  const { level = "info", msg, meta = {} } = data;
  const allowed: Level[] = ["trace", "debug", "info", "warn", "error", "fatal"];

  if (!allowed.includes(level)) {
    return { error: `Invalid log level: ${level}` };
  }

  serverLogger.child({ src: "frontend" })[level](meta ?? {}, msg);

  return { data: true };
}

export async function getAvailableLogDates(): Promise<Result<string[]>> {
  const logDir = path.join(getCacheDirPath(), "logs");

  try {
    const files = await fs.promises.readdir(logDir);

    return {
      data: files
        .filter((f) => /^app\.\d{4}-\d{2}-\d{2}\.log$/.test(f))
        .map((f) => f.slice(4, -4))
        .sort()
        .reverse(),
    };
  } catch (error) {
    logError({
      shortMessage: "Failed to read log directory",
      error,
    });
    return { error: "Failed to read log directory" };
  }
}
