import { TemplateMigration } from "@timonteutelink/template-types-lib";
import semver from "semver";

import { MAJOR_SPEC_VERSION } from "../../lib/constants";
import { logError } from "../../lib/utils";
import { checkMissingPartials, checkMissingSettings } from "../../utils/handlebars-utils";
import { getDocLink } from "../../utils/shared-utils";
import { Template } from "./Template";

export class InvalidTemplateSpecVersionError extends Error {
  constructor(templateName: string, templateSpecVersion: string) {
    const templateVersion = semver.coerce(templateSpecVersion) ?? "0.0.0";
    const majorTemplateVersion = semver.major(templateVersion);
    super(
      `Template: ${templateName} is using an ${
        majorTemplateVersion > MAJOR_SPEC_VERSION ? "newer" : "older"
      } version. Please upgrade to major version: ${MAJOR_SPEC_VERSION}. Check out ${getDocLink(
        `docs/migration-guide#${MAJOR_SPEC_VERSION}`,
      )} for a full migration guide`,
    );
    this.name = "InvalidTemplateSpecVersionError";
  }
}

export function validateTemplateSpecVersion(
  templateName: string,
  specVersion: string,
): void {
  if (
    semver.major(semver.coerce(specVersion) ?? "0.0.0") !== MAJOR_SPEC_VERSION
  ) {
    throw new InvalidTemplateSpecVersionError(templateName, specVersion);
  }
}

export async function validateTemplateResources(template: Template): Promise<void> {
  try {
    await checkMissingSettings(template);
    await checkMissingPartials(template);
  } catch (error) {
    logError({
      error,
      shortMessage: "Template validation failed",
    });
    throw error;
  }
}

export function validateTemplateMigrations(template: Template): void {
  const migrations = template.config.migrations;
  if (!migrations || migrations.length === 0) {
    return;
  }

  const templateName = template.config.templateConfig.name;
  const seenUuids = new Set<string>();
  for (const migration of migrations) {
    if (seenUuids.has(migration.uuid)) {
      throw new Error(
        `Template ${templateName} has duplicate migration uuid "${migration.uuid}".`,
      );
    }
    seenUuids.add(migration.uuid);
  }

  const migrationsByUuid = new Map(
    migrations.map((migration) => [migration.uuid, migration]),
  );

  for (const migration of migrations) {
    if (
      migration.previousMigration &&
      !migrationsByUuid.has(migration.previousMigration)
    ) {
      throw new Error(
        `Template ${templateName} migration "${migration.uuid}" references missing previousMigration "${migration.previousMigration}".`,
      );
    }
  }

  const migrationsByPrevious = new Map<string | undefined, TemplateMigration[]>();
  for (const migration of migrations) {
    const list = migrationsByPrevious.get(migration.previousMigration) ?? [];
    list.push(migration);
    migrationsByPrevious.set(migration.previousMigration, list);
  }

  const roots = migrationsByPrevious.get(undefined) ?? [];
  if (roots.length !== 1) {
    if (roots.length === 0) {
      throw new Error(
        `Template ${templateName} migrations must have a single root migration with previousMigration undefined.`,
      );
    }

    const rootList = roots.map((migration) => `"${migration.uuid}"`).join(", ");
    throw new Error(
      `Template ${templateName} has multiple root migrations: ${rootList}.`,
    );
  }

  for (const [previousMigration, list] of migrationsByPrevious) {
    if (list.length > 1) {
      const forkList = list.map((migration) => `"${migration.uuid}"`).join(", ");
      throw new Error(
        `Template ${templateName} migration graph forks at previousMigration "${previousMigration ?? "undefined"}": ${forkList}.`,
      );
    }
  }

  const visited = new Set<string>();
  let current = roots[0];
  while (current) {
    if (visited.has(current.uuid)) {
      throw new Error(
        `Template ${templateName} migration graph contains a cycle at "${current.uuid}".`,
      );
    }
    visited.add(current.uuid);
    const next = migrationsByPrevious.get(current.uuid)?.[0];
    if (!next) {
      break;
    }
    current = next;
  }

  if (visited.size !== migrations.length) {
    const unreachable = migrations
      .filter((migration) => !visited.has(migration.uuid))
      .map((migration) => `"${migration.uuid}"`)
      .join(", ");
    throw new Error(
      `Template ${templateName} has migrations not reachable from the root (cycle or disconnected chain): ${unreachable}.`,
    );
  }
}

export async function validateTemplate(template: Template): Promise<void> {
  validateTemplateSpecVersion(
    template.config.templateConfig.name,
    template.config.templateConfig.specVersion,
  );

  validateTemplateMigrations(template);
  await validateTemplateResources(template);
}
