import { TemplateMigration, UserTemplateSettings } from "@timonteutelink/template-types-lib";

export function applyTemplateMigrationSequence(
  migrations: TemplateMigration[] | undefined,
  settings: UserTemplateSettings,
  fromMigration?: string,
): { settings: UserTemplateSettings; lastMigration?: string } {
  let currentId: string | undefined = fromMigration;
  let currentSettings = settings;

  if (!migrations) {
    return { settings: currentSettings, lastMigration: currentId };
  }

  while (true) {
    const next = migrations.find((m) => m.previousMigration === currentId);
    if (!next) {
      break;
    }
    currentSettings = next.migrate(currentSettings);
    currentId = next.uuid;
  }

  return { settings: currentSettings, lastMigration: currentId };
}

export function getLatestTemplateMigrationUuid(
  migrations: TemplateMigration[] | undefined,
): string | undefined {
  if (!migrations || migrations.length === 0) {
    return undefined;
  }
  const previous = new Set(
    migrations
      .map((m) => m.previousMigration)
      .filter((id): id is string => Boolean(id)),
  );
  return migrations.find((m) => !previous.has(m.uuid))?.uuid;
}

