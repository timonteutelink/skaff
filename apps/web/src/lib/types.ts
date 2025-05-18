export type Level = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

export type LogJSON = {
  time: number;
  level: number;
  msg?: string;
  src?: "backend" | "frontend";
  [k: string]: unknown;
};

export type LogFilter = {
  levels?: Level[];
  src?: ("backend" | "frontend")[];
  q?: string;
  from?: string; // ISO date or ms
  to?: string;
  file?: string; // defaults to today (YYYY-MM-DD)
  pretty?: boolean; // human readable
  limit?: number; // max lines
};

export const LEVEL_NAMES: Record<number, Level> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

export const ALL_LEVELS: Level[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
];

export type Source = "backend" | "frontend";
