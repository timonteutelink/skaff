export type LevelName = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type LogJSON = {
  time: number;               // epoch ms
  level: LevelName;
  msg: string;
  src: "backend" | "frontend";
  meta?: unknown;
  // optional winston extras:
  logger?: string;
  stack?: string;
};

export type LogFilter = {
  levels?: LevelName[];
  src?: Array<"backend" | "frontend">;
  q?: string;
  from?: string;              // ISO
  to?: string;                // ISO
  file?: string;              // YYYY-MM-DD
  pretty?: boolean;
  limit?: number;
};

