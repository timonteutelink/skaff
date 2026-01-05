import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, jest } from "@jest/globals";
import { z } from "zod";

import { createMockHardenedSandboxModule } from "./helpers/mock-sandbox";
import type { GenericTemplateConfigModule } from "../src/lib/types";
import { Template } from "../src/core/templates/Template";
import { RollbackFileSystem } from "../src/core/generation/RollbackFileSystem";
import { HandlebarsEnvironment } from "../src/core/shared/HandlebarsEnvironment";
import { TargetPathResolver } from "../src/core/generation/pipeline/TargetPathResolver";
import { TemplatePipelineContext } from "../src/core/generation/pipeline/TemplatePipelineContext";
import { TemplateFileMaterializer } from "../src/core/generation/pipeline/TemplateFileMaterializer";
import { createTempDir, writeTemplateFileTree } from "./lib/fs-fixtures";

jest.mock("../src/core/infra/hardened-sandbox", () => ({
  ...createMockHardenedSandboxModule(),
}));

jest.mock("../src/lib/logger", () => ({
  backendLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  },
}));

describe("TemplateFileMaterializer", () => {
  it("renders Handlebars helpers defined by the template", async () => {
    const { root: baseDir } = await createTempDir("skaff-helper-");
    const templateDir = path.join(baseDir, "template");
    const { filesDir } = await writeTemplateFileTree({
      root: templateDir,
      files: { "message.hbs": "Hi {{shout message}}" },
    });
    const outputDir = path.join(baseDir, "output");

    const templateSettingsSchema = z.object({ message: z.string() });
    const templateConfig: GenericTemplateConfigModule = {
      templateConfig: {
        name: "helper-template",
        author: "Test",
        specVersion: "0.0.1",
      },
      templateSettingsSchema,
      templateFinalSettingsSchema: templateSettingsSchema,
      mapFinalSettings: ({ templateSettings }) => templateSettings,
      handlebarHelpers: {
        shout: (value: string) => value.toUpperCase(),
      },
    } as GenericTemplateConfigModule;

    const template = new Template({
      config: templateConfig,
      absoluteBaseDir: baseDir,
      absoluteDir: templateDir,
      absoluteFilesDir: filesDir,
    });

    const context = new TemplatePipelineContext(template);
    context.setCurrentState({
      template,
      finalSettings: { message: "hello" },
    });

    const resolver = new TargetPathResolver(outputDir, context);
    const fileSystem = new RollbackFileSystem();
    const handlebars = new HandlebarsEnvironment();
    const materializer = new TemplateFileMaterializer(
      context,
      resolver,
      fileSystem,
      handlebars,
    );

    const result = await materializer.copyTemplateDirectory();
    expect(result).toEqual({ data: undefined });

    const output = await fs.readFile(path.join(outputDir, "message"), "utf8");
    expect(output).toBe("Hi HELLO");
  });
});
