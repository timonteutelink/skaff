import {
  TemplateMigration,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";

import { injectable } from "tsyringe";

import { getSkaffContainer } from "../../di/container";
import {
  applyTemplateMigrationSequence,
  getLatestTemplateMigrationUuid,
} from "../templates/TemplateMigration";

@injectable()
export class MigrationApplier {
  public applyMigrations(
    migrations: TemplateMigration[] | undefined,
    settings: UserTemplateSettings,
    fromMigration?: string,
  ): { settings: UserTemplateSettings; lastMigration?: string } {
    return applyTemplateMigrationSequence(migrations, settings, fromMigration);
  }

  public getLatestMigration(
    migrations: TemplateMigration[] | undefined,
  ): string | undefined {
    return getLatestTemplateMigrationUuid(migrations);
  }
}

export function resolveMigrationApplier(): MigrationApplier {
  return getSkaffContainer().resolve(MigrationApplier);
}
