export type LevelName = "trace" | "debug" | "info" | "warn" | "error" | "fatal";
export type Source = "backend" | "frontend";

export type LogJSON = {
  time: number;               // epoch ms
  level: LevelName;           // string level (not numeric)
  msg: string;
  src: Source;
  meta?: unknown;
  logger?: string;
  stack?: string;
};

export type LogFilter = {
  levels?: LevelName[];
  src?: Source[];
  q?: string;
  from?: string;              // ISO
  to?: string;                // ISO
  file?: string;              // YYYY-MM-DD
  pretty?: boolean;
  limit?: number;
};

export const ALL_LEVELS: LevelName[] = [
  "trace", "debug", "info", "warn", "error", "fatal",
];

export const ALL_SOURCES: Source[] = ["backend", "frontend"];

