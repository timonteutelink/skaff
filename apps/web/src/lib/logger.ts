"use client";

import pino, { Level, LogEvent } from "pino";
import { logFromClient } from "@/app/actions/logs";

const logger = pino({
  base: { src: "frontend" },
  browser: {
    asObject: true,
    transmit: {
      level: "debug",
      send: async (level: Level, ev: LogEvent) => {
        try {
          await logFromClient({
            level,
            msg: ev.messages[0] ?? "client log",
            meta: ev,
          });
        } catch (err) {
          console.error("Failed to send log to server:", err);
        }
      },
    },
  },
});

export default logger;
