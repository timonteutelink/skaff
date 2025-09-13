import {
  InstantiatedTemplate,
} from "@timonteutelink/template-types-lib";
import { Template } from "../models/template";
import { logError } from "../lib/utils";

export function applyTemplateMigrations(
  template: Template,
  instantiated: InstantiatedTemplate,
): boolean {
  const migrations = template.migrations || [];
  let startIndex = 0;
  if (instantiated.migrationUuid) {
    const idx = migrations.findIndex((m) => m.id === instantiated.migrationUuid);
    if (idx >= 0) {
      startIndex = idx + 1;
    }
  }
  if (startIndex >= migrations.length) {
    return false;
  }
  for (let i = startIndex; i < migrations.length; i++) {
    const migration = migrations[i]!;
    try {
      instantiated.templateSettings = migration.migrate(
        instantiated.templateSettings,
      );
    } catch (error) {
      logError({
        shortMessage: `Failed to apply migration ${migration.id}`,
        error,
      });
      continue;
    }
    instantiated.migrationUuid = migration.id;
  }
  return true;
}
