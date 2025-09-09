"use client";

import log, { LogLevelDesc } from "loglevel";
import { logFromClient } from "@/app/actions/logs";
import { LevelName } from "@timonteutelink/code-templator-lib";

const defaultLevel: LogLevelDesc =
  (process.env.NEXT_PUBLIC_LOG_LEVEL as LogLevelDesc) ?? "info";
log.setLevel(defaultLevel);

const send = async (level: LevelName, msg: string, meta?: unknown) => {
  try {
    await logFromClient({ level, msg, meta });
  } catch (err) {
    console.error("Failed to send browser log:", err);
  }
};

const logger = {
  trace: (msg: string, meta?: unknown) => { log.trace(msg, meta); void send("trace", msg, meta); },
  debug: (msg: string, meta?: unknown) => { log.debug(msg, meta); void send("debug", msg, meta); },
  info: (msg: string, meta?: unknown) => { log.info(msg, meta); void send("info", msg, meta); },
  warn: (msg: string, meta?: unknown) => { log.warn(msg, meta); void send("warn", msg, meta); },
  error: (msg: string, meta?: unknown) => { log.error(msg, meta); void send("error", msg, meta); },
  fatal: (msg: string, meta?: unknown) => { log.error(msg, meta); void send("fatal", msg, meta); },
  setLevel: (lvl: LogLevelDesc) => log.setLevel(lvl),
};

export default logger;

