"use server"

import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"
import prettyPrint from "pino-pretty"
import type { Level, LogEvent } from "pino"
import { logger } from "@repo/ts/lib/logger";
import { Result } from "@repo/ts/lib/types";

export type LogJSON = {
  time: number
  level: number
  msg?: string
  src?: "backend" | "frontend"
  [k: string]: unknown
}

export type LogFilter = {
  levels?: Level[]
  src?: string[]
  q?: string
  from?: string
  to?: string
  file?: string
  pretty?: boolean
  limit?: number
}

const LEVEL_NAMES: Record<number, Level> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
}

export async function fetchLogs(filter: LogFilter): Promise<Result<LogJSON[] | string>> {
  const { levels, src, q, from, to, file = new Date().toISOString().slice(0, 10), pretty = false, limit = 500 } = filter

  const fromMs = from ? Date.parse(from) : null
  const toMs = to ? Date.parse(to) : null
  const logPath = path.join(process.cwd(), "logs", `app-${file}.log`)

  try {
    await fs.promises.access(logPath, fs.constants.R_OK)
  } catch {
    return { data: [] };
    // logger.error({ file }, "Log file not found")
    // return { error: `Log file not found: ${logPath}` }
  }

  const rli = readline.createInterface({
    input: fs.createReadStream(logPath, { encoding: "utf8" }),
    crlfDelay: Number.POSITIVE_INFINITY,
  })

  const matches: LogJSON[] = []
  for await (const line of rli) {
    if (!line.trim()) continue

    let obj
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }

    if (levels && levels.length > 0 && !levels.includes(LEVEL_NAMES[obj.level] || "" as Level)) continue
    if (src && src.length > 0 && !src.includes(obj.src ?? "backend")) continue
    if (fromMs && obj.time < fromMs) continue
    if (toMs && obj.time > toMs) continue
    if (q && !JSON.stringify(obj).toLowerCase().includes(q.toLowerCase())) continue

    matches.push(obj)
    if (matches.length >= limit) break
  }

  rli.close()

  if (!pretty) {
    return { data: matches }
  }

  const prettyStream = prettyPrint({
    colorize: false,
    sync: true,
    translateTime: "SYS:standard",
  })

  return {
    data: matches
      .map((m) => {
        const formatted = prettyStream.write(JSON.stringify(m))
        return formatted || ""
      })
      .join("")
  }
}

export async function logFromClient(data: {
  level: Level
  msg: string
  meta?: LogEvent
}): Promise<Result<boolean>> {
  const { level = "info", msg, meta = {} } = data

  const allowed: Level[] = ["trace", "debug", "info", "warn", "error", "fatal"]
  if (!allowed.includes(level)) {
    logger.error(`Invalid log level: ${level}`)
    return { error: `Invalid log level: ${level}` }
  }

  logger[level](meta, msg)

  return { data: true }
}

export async function getAvailableLogDates(): Promise<Result<string[]>> {
  const logDir = path.join(process.cwd(), "logs")

  try {
    const files = await fs.promises.readdir(logDir)

    return {
      data: files
        .filter((file) => file.match(/^app-\d{4}-\d{2}-\d{2}\.log$/))
        .map((file) => file.replace(/^app-(.+)\.log$/, "$1"))
        .sort()
        .reverse() // Most recent first
    }
  } catch (error) {
    logger.error({ error }, "Failed to read log directory")
    return { error: "Failed to read log directory" }
  }
}

