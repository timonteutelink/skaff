'use client';
import { logFromClient } from "@/app/actions/logs"
import pino, { Level, LogEvent } from "pino"

const logger = pino({
  base: { src: "frontend" },
  browser: {
    asObject: true,

    transmit: {
      level: "debug", // send everything >= debug
      send: async (level: Level, logEvent: LogEvent) => {
        try {
          await logFromClient({
            level,
            msg: logEvent.messages[0] || "Client log",
            meta: logEvent,
          })
        } catch (error) {
          logger.error("Failed to send log to server:", error)
        }
      },
    },
  },
})

export default logger

