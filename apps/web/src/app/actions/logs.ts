"use server";

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import {
  LevelName,
  LogFilter,
  LogJSON,
  Result,
  logError,
  resolveCacheService,
  serverLogger,
} from "@timonteutelink/skaff-lib";

const cacheService = resolveCacheService();

export async function logFromClient(data: {
  level: LevelName;
  msg: string;
  meta?: unknown;
}): Promise<Result<boolean>> {
  const allowed: LevelName[] = ["trace", "debug", "info", "warn", "error", "fatal"];
  const { level, msg, meta } = data;

  if (!allowed.includes(level)) {
    return { error: `Invalid log level: ${String(level)}` };
  }

  serverLogger.child({ src: "frontend" }).log({
    level,
    message: (msg ?? "client log").toString(),
    meta,
  });

  return { data: true };
}

export async function fetchLogs(filter: LogFilter): Promise<Result<LogJSON[] | string>> {
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
    cacheService.getCacheDirPath(),
    "logs",
    `skaff.${file}.log`,
  );

  try {
    await fs.promises.access(logPath, fs.constants.R_OK);
  } catch {
    return { data: [] }; // no log file for that date
  }

  const rli = readline.createInterface({
    input: fs.createReadStream(logPath, { encoding: "utf8" }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  const matches: LogJSON[] = [];

  for await (const line of rli) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let obj: LogJSON | null = null;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue; // skip corrupted
    }
    if (!obj) continue;

    if (levels?.length && !levels.includes(obj.level)) continue;
    if (src?.length && !src.includes(obj.src ?? "backend")) continue;
    if (fromMs !== null && obj.time < fromMs) continue;
    if (toMs !== null && obj.time > toMs) continue;
    if (q && !JSON.stringify(obj).toLowerCase().includes(q.toLowerCase())) continue;

    matches.push(obj);
    if (matches.length >= limit) break;
  }

  rli.close();

  if (!pretty) {
    return { data: matches.reverse() }; // newest first
  }

  const lines = matches.map(prettyLine).join("\n");
  return { data: lines };
}

export async function getAvailableLogDates(): Promise<Result<string[]>> {
  const logDir = await cacheService.getCacheDir();

  if ("error" in logDir) {
    logError({ shortMessage: "Failed to get cache directory", error: logDir.error });
    return { error: "Failed to get cache directory" };
  }

  try {
    const files = await fs.promises.readdir(path.join(logDir.data, "logs"));

    const dates = files
      .filter((f) => /^skaff\.\d{4}-\d{2}-\d{2}\.log$/.test(f))
      .map((f) => f.slice("skaff.".length, -".log".length))
      .sort()
      .reverse();

    return { data: dates };
  } catch (error) {
    logError({ shortMessage: "Failed to read log directory", error });
    return { error: "Failed to read log directory" };
  }
}


function prettyLine(m: LogJSON): string {
  const ts = new Date(m.time).toISOString();
  const meta = m.meta ? ` ${JSON.stringify(m.meta)}` : "";
  const stack = (m as any).stack ? `\n${(m as any).stack}` : "";
  return `${ts} ${m.level.toUpperCase()} [${m.src}] ${m.msg}${meta}${stack}`;
}

