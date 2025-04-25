import pino from "pino"
import path from "path"
import { getCacheDirPath } from "../services/cache-service"

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { src: "backend" },

  transport: {
    targets: [
      ...(process.env.NODE_ENV !== "production"
        ? [
          {
            target: "pino-pretty",
            level: process.env.LOG_LEVEL ?? "info",
            options: { colorize: true },
          },
        ]
        : []),

      {
        target: "pino/file",
        options: {
          destination: path.join(getCacheDirPath(), "logs", "app-%Y-%m-%d.log"),
          mkdir: true,
          sync: false,
          rotate: {
            interval: "1d", // rotate daily
            size: "10m", // or when file hits 10 MiB
            maxFiles: 14, // keep two weeks
          },
        },
        level: process.env.LOG_LEVEL ?? "info",
      },
    ],
  },
})

