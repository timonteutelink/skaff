import { Command, Option } from "commander";

export const DEFAULT_FORMAT = "table" as const;
export type Format = "json" | "ndjson" | "tsv" | "table";

export function printFormatted<T extends Record<string, unknown>>(
  data: T | T[],
  format: Format = DEFAULT_FORMAT
) {
  switch (format) {
    case "json":
      console.log(JSON.stringify(data, null, 2));
      break;

    case "ndjson":
      (Array.isArray(data) ? data : [data]).forEach(o =>
        console.log(JSON.stringify(o))
      );
      break;

    case "tsv": {
      const rows = Array.isArray(data) ? data : [data];
      const keys = Object.keys(rows[0] ?? {});
      console.log(keys.join("\t"));
      rows.forEach(r =>
        console.log(
          keys
            .map(k =>
              String(r[k] ?? "").replace(/[\t\r\n]+/g, " ")
            )
            .join("\t")
        )
      );
      break;
    }

    case "table":
    default:
      console.table(data);
  }
}

export function addGlobalFormatOption(cmd: Command) {
  cmd.addOption(
    new Option("-f, --format <format>", "output format")
      .choices(["json", "ndjson", "tsv", "table"])
      .default(DEFAULT_FORMAT)
  );
}

export function withFormatting<
  A extends unknown[],
  R extends Record<string, unknown> | Record<string, unknown>[] | void
>(action: (...args: A) => Promise<R> | R) {
  return async (...args: A) => {
    const command = args[args.length - 1] as Command | undefined;
    const opts =
      args.length >= 2 && typeof args[args.length - 2] === "object"
        ? (args[args.length - 2] as Record<string, unknown>)
        : undefined;

    const format =
      (opts?.format as Format | undefined) ??
      (command?.optsWithGlobals?.().format as Format | undefined) ??
      DEFAULT_FORMAT;

    const result = await action(...args);
    if (result !== undefined) {
      printFormatted(result, format);
    }
  };
}

