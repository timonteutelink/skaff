import {
  TemplateMigration,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";

import {
  applyTemplateMigrations,
  latestMigrationUuid,
} from "../../services/template-migration-service";

export class MigrationApplier {
  public applyMigrations(
    migrations: TemplateMigration[] | undefined,
    settings: UserTemplateSettings,
    fromMigration?: string,
  ): { settings: UserTemplateSettings; lastMigration?: string } {
    return applyTemplateMigrations(migrations, settings, fromMigration);
  }

  public getLatestMigration(
    migrations: TemplateMigration[] | undefined,
  ): string | undefined {
    return latestMigrationUuid(migrations);
  }
}
