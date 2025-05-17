import { getConfig, logger } from "@timonteutelink/code-templator-lib";
import { Command } from "commander";
import { withFormatting } from "../cli-utils";


export function registerConfigCommand(program: Command) {
  const cmd = program
    .command("config [key]")
    .description(
      "View code-templator settings (optionally specify a single key)"
    );


  cmd.action(
    withFormatting(async (key: string | undefined) => {
      const cfg = await getConfig();
      const allKeys = Object.keys(cfg);

      if (key) {
        if (!allKeys.includes(key)) {
          logger.error(
            `Unknown configuration key '${key}'. Valid keys: ${allKeys.join(
              ", "
            )}`
          );
          process.exit(1);
        }
        return { [key]: (cfg as any)[key] };
      }

      return cfg;
    })
  );
}

