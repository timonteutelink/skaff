import { Command } from "commander";
import { withFormatting } from "../cli-utils";
import {
  getConfig,
  setConfig,
  addConfigItems,
  removeConfigItems,
  Settings,
  logger,
} from "@timonteutelink/code-templator-lib";

const ARRAY_KEYS = ["TEMPLATE_DIR_PATHS", "PROJECT_SEARCH_PATHS"] as const;
type ArrayKey = (typeof ARRAY_KEYS)[number];

export function registerConfigCommand(program: Command) {
  const config = program
    .command("config")
    .description("Manage code-templator settings");

  // VIEW
  const view = config
    .command("get [key]")
    .description("Show all settings or a single key");
  view.action(
    withFormatting(async (key: string | undefined) => {
      const cfg = await getConfig();
      if (key) {
        if (!(key in cfg)) {
          logger.error(
            `Unknown key '${key}'. Valid keys: ${Object.keys(cfg).join(", ")}`,
          );
          process.exit(1);
        }
        return { [key]: (cfg as any)[key] };
      }
      return cfg;
    }),
  );

  // SET (scalars only)
  config
    .command("set <key> <value>")
    .description("Set a scalar setting (for array keys, use 'add' or 'remove')")
    .action(async (key: string, value: string) => {
      if (ARRAY_KEYS.includes(key as ArrayKey)) {
        logger.error(
          `'${key}' is an array setting—use 'config add' or 'config remove'`,
        );
        process.exit(1);
      }
      await setConfig(key as keyof Settings, value);
      console.log(`Updated ${key} = ${value}`);
    });

  // ADD to array
  config
    .command("add <key> <items...>")
    .description("Add one or more values to an array setting")
    .action(async (key: string, items: string[]) => {
      if (!ARRAY_KEYS.includes(key as ArrayKey)) {
        logger.error(
          `'${key}' is not a list setting. Valid list keys: ${ARRAY_KEYS.join(
            ", ",
          )}`,
        );
        process.exit(1);
      }
      await addConfigItems(key as ArrayKey, items);
      console.log(`Added ${items.join(", ")} to ${key}`);
    });

  // REMOVE from array
  config
    .command("remove <key> <items...>")
    .description("Remove one or more values from an array setting")
    .action(async (key: string, items: string[]) => {
      if (!ARRAY_KEYS.includes(key as ArrayKey)) {
        logger.error(
          `'${key}' is not a list setting. Valid list keys: ${ARRAY_KEYS.join(
            ", ",
          )}`,
        );
        process.exit(1);
      }
      await removeConfigItems(key as ArrayKey, items);
      console.log(`Removed ${items.join(", ")} from ${key}`);
    });
}
