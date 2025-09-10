import fs from "node:fs";
import path from "node:path";
import { createLogger, format, transports } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import type { LevelName, LogJSON } from "./types";
import { makeDir } from "../../services/file-service";
import { getCacheDirPath } from "../../services/cache-service";

const customLevels = {
  levels: {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5,
  },
};

const LOG_DIR = path.join(getCacheDirPath(), "logs");
if (!fs.existsSync(LOG_DIR)) makeDir(LOG_DIR);

const jsonLine = format.printf((info) => {
  const base: LogJSON = {
    time: (info.time ?? Date.now()) as number,
    level: info.level as LevelName,
    msg: info.message as string,
    src: (info.src ?? "backend") as "backend" | "frontend",
    meta: info.meta,
    logger: "winston",
    stack: info.stack as string | undefined,
  };
  return JSON.stringify(base);
});

const consolePretty = format.printf((info) => {
  const ts = new Date((info.time ?? Date.now()) as number).toISOString();
  const src = info.src ?? "backend";
  const msg = info.message;
  const meta = info.meta ? ` ${JSON.stringify(info.meta)}` : "";
  const stack = info.stack ? `\n${info.stack}` : "";
  return `${ts} ${String(info.level).toUpperCase()} [${src}] ${msg}${meta}${stack}`;
});

export const serverLogger = createLogger({
  levels: customLevels.levels,
  level: process.env.NEXT_PUBLIC_LOG_LEVEL ?? "info",
  defaultMeta: { src: "backend" },
  format: format.combine(
    format.errors({ stack: true }),
    format.timestamp({ alias: "time", format: () => (new Date()).toISOString() }),
  ),
  transports: [
    new transports.Console({
      format: format.combine(format.colorize(), consolePretty),
    }),
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: "skaff.%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: false,
      maxFiles: process.env.NEXT_PUBLIC_LOG_MAX_FILES ?? "14d",
      format: jsonLine,
      level: process.env.NEXT_PUBLIC_FILE_LOG_LEVEL ?? "info",
    }),
  ],
});

export const backendLogger = serverLogger.child({ src: "backend" });

