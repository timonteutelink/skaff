import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, jest } from "@jest/globals";
import type { HelperDelegate } from "handlebars";
import { z } from "zod";

import { Template } from "../src/core/templates/Template";
import { validateTemplateResources } from "../src/core/templates/TemplateValidation";
import type { GenericTemplateConfigModule } from "../src/lib/types";
import { createTempDir, writeTemplateFileTree } from "./lib";

jest.mock("../src/lib/logger", () => ({
  backendLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  },
}));

type TemplateFixture = {
  template: Template;
};

async function createTemplateFixture(options: {
  fileContents?: string;
  files?: Record<string, string>;
  schema: z.ZodType;
  partials?: Record<string, string>;
  handlebarHelpers?: Record<string, HelperDelegate>;
}): Promise<TemplateFixture> {
  const { root: baseDir } = await createTempDir("skaff-hbs-");
  const templateDir = path.join(baseDir, "template");
  const files =
    options.files ??
    (options.fileContents
      ? { "template.txt": options.fileContents }
      : undefined);
  const { filesDir } = await writeTemplateFileTree({
    root: templateDir,
    files: files ?? { "template.txt": "" },
  });

  let partialsDir: string | undefined;
  if (options.partials) {
    partialsDir = path.join(templateDir, "partials");
    await fs.mkdir(partialsDir, { recursive: true });
    for (const [name, contents] of Object.entries(options.partials)) {
      await fs.writeFile(path.join(partialsDir, `${name}.hbs`), contents, "utf8");
    }
  }

  const templateConfig: GenericTemplateConfigModule = {
    templateConfig: {
      name: "validation-template",
      author: "Test",
      specVersion: "0.0.1",
    },
    templateSettingsSchema: options.schema,
    templateFinalSettingsSchema: options.schema,
    mapFinalSettings: ({ templateSettings }) => templateSettings,
    handlebarHelpers: options.handlebarHelpers,
  } as GenericTemplateConfigModule;

  const template = new Template({
    config: templateConfig,
    absoluteBaseDir: baseDir,
    absoluteDir: templateDir,
    absoluteFilesDir: filesDir,
    partialsDir,
  });

  return {
    template,
  };
}

describe("handlebars template validation", () => {
  it("reports missing partials", async () => {
    const fixture = await createTemplateFixture({
      fileContents: "Hello {{> missing_partial}}",
      schema: z.object({ message: z.string().default("hi") }),
    });

    await expect(validateTemplateResources(fixture.template)).rejects.toMatchObject({
      name: "TemplateResourceValidationError",
      templateName: "validation-template",
      missingPartials: ["missing_partial"],
    });
  });

  it("reports missing settings", async () => {
    const fixture = await createTemplateFixture({
      fileContents: "Hello {{missing_setting}}",
      schema: z.object({ message: z.string().default("hi") }),
    });

    await expect(validateTemplateResources(fixture.template)).rejects.toMatchObject({
      name: "TemplateResourceValidationError",
      templateName: "validation-template",
      missingSettings: ["missing_setting"],
    });
  });

  it("reports missing helpers", async () => {
    const fixture = await createTemplateFixture({
      fileContents: "Hello {{missingHelper message}}",
      schema: z.object({ message: z.string().default("hi") }),
    });

    await expect(validateTemplateResources(fixture.template)).rejects.toMatchObject({
      name: "TemplateResourceValidationError",
      templateName: "validation-template",
      missingHelpers: ["missingHelper"],
    });
  });

  it("allows built-in and default helpers", async () => {
    const fixture = await createTemplateFixture({
      fileContents:
        "{{#if enabled}}{{snakeCase message}}{{/if}}{{#unless disabled}}{{eq message \"hi\"}}{{/unless}}",
      schema: z.object({
        enabled: z.boolean().default(true),
        disabled: z.boolean().default(false),
        message: z.string().default("hi"),
      }),
    });

    await expect(validateTemplateResources(fixture.template)).resolves.toBeUndefined();
  });

  it("allows helpers defined on the template", async () => {
    const fixture = await createTemplateFixture({
      fileContents: "Hello {{shout message}}",
      schema: z.object({ message: z.string().default("hi") }),
      handlebarHelpers: {
        shout: (value: string) => value.toUpperCase(),
      },
    });

    await expect(validateTemplateResources(fixture.template)).resolves.toBeUndefined();
  });

  it("detects missing settings referenced in partials", async () => {
    const fixture = await createTemplateFixture({
      fileContents: "Hello {{> shared}}",
      schema: z.object({ message: z.string().default("hi") }),
      partials: {
        shared: "Partial says {{missing_setting}}",
      },
    });

    await expect(validateTemplateResources(fixture.template)).rejects.toMatchObject({
      name: "TemplateResourceValidationError",
      missingSettings: ["missing_setting"],
    });
  });

  it("supports nested settings paths and array indices", async () => {
    const fixture = await createTemplateFixture({
      fileContents: "First item: {{items.0.label}}",
      schema: z.object({
        items: z.array(z.object({ label: z.string() })).default([{ label: "one" }]),
      }),
    });

    await expect(validateTemplateResources(fixture.template)).resolves.toBeUndefined();
  });

  it("detects missing helpers in subexpressions", async () => {
    const fixture = await createTemplateFixture({
      fileContents: "Hello {{uppercase (missingSubHelper message)}}",
      schema: z.object({ message: z.string().default("hi") }),
      handlebarHelpers: {
        uppercase: (value: string) => value.toUpperCase(),
      },
    });

    await expect(validateTemplateResources(fixture.template)).rejects.toMatchObject({
      name: "TemplateResourceValidationError",
      missingHelpers: ["missingSubHelper"],
    });
  });
});
