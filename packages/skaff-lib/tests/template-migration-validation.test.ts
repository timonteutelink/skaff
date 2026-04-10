import path from "node:path";

import type { TemplateMigration } from "@timonteutelink/template-types-lib";
import z from "zod";

import { Template } from "../src/core/templates/Template";
import { validateTemplateMigrations } from "../src/core/templates/TemplateValidation";
import type { GenericTemplateConfigModule } from "../src/lib/types";

describe("validateTemplateMigrations", () => {
  const baseDir = "/repo/templates";
  const emptySchema = z.object({});
  const noopMigrate = (settings: Record<string, unknown>) => settings;

  const createTemplate = (migrations: TemplateMigration[]): Template => {
    const config: GenericTemplateConfigModule = {
      templateConfig: {
        name: "sample-template",
        author: "Test Author",
        specVersion: "1.0.0",
      },
      templateSettingsSchema: emptySchema,
      templateFinalSettingsSchema: emptySchema,
      mapFinalSettings: ({ templateSettings }) => templateSettings,
      migrations,
    };

    return new Template({
      config,
      absoluteBaseDir: baseDir,
      absoluteDir: path.join(baseDir, "sample-template"),
      absoluteFilesDir: path.join(baseDir, "sample-template", "files"),
    });
  };

  it("throws when migration UUIDs are duplicated", () => {
    const migrations: TemplateMigration[] = [
      { uuid: "m1", migrate: noopMigrate },
      { uuid: "m1", previousMigration: "m1", migrate: noopMigrate },
    ];

    const template = createTemplate(migrations);

    expect(() => validateTemplateMigrations(template)).toThrow(
      'Template sample-template has duplicate migration uuid "m1".',
    );
  });

  it("throws when previousMigration references are missing", () => {
    const migrations: TemplateMigration[] = [
      { uuid: "m1", migrate: noopMigrate },
      { uuid: "m2", previousMigration: "missing", migrate: noopMigrate },
    ];

    const template = createTemplate(migrations);

    expect(() => validateTemplateMigrations(template)).toThrow(
      'Template sample-template migration "m2" references missing previousMigration "missing".',
    );
  });

  it("throws when multiple roots exist", () => {
    const migrations: TemplateMigration[] = [
      { uuid: "m1", migrate: noopMigrate },
      { uuid: "m2", migrate: noopMigrate },
    ];

    const template = createTemplate(migrations);

    expect(() => validateTemplateMigrations(template)).toThrow(
      'Template sample-template has multiple root migrations: "m1", "m2".',
    );
  });

  it("throws when migrations are not reachable from the root", () => {
    const migrations: TemplateMigration[] = [
      { uuid: "m1", migrate: noopMigrate },
      { uuid: "m2", previousMigration: "m1", migrate: noopMigrate },
      { uuid: "m3", previousMigration: "m4", migrate: noopMigrate },
      { uuid: "m4", previousMigration: "m3", migrate: noopMigrate },
    ];

    const template = createTemplate(migrations);

    expect(() => validateTemplateMigrations(template)).toThrow(
      'Template sample-template has migrations not reachable from the root (cycle or disconnected chain): "m3", "m4".',
    );
  });
});
