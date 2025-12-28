import fs from "node:fs/promises";
import os from "node:os";
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
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "skaff-helper-"));
    const filesDir = path.join(baseDir, "template", "files");
    const outputDir = path.join(baseDir, "output");

    await fs.mkdir(filesDir, { recursive: true });
    await fs.writeFile(
      path.join(filesDir, "message.hbs"),
      "Hi {{shout message}}",
      "utf8",
    );

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
      absoluteDir: path.join(baseDir, "template"),
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

    try {
      const result = await materializer.copyTemplateDirectory();
      expect(result).toEqual({ data: undefined });

      const output = await fs.readFile(
        path.join(outputDir, "message"),
        "utf8",
      );
      expect(output).toBe("Hi HELLO");
    } finally {
      await fs.rm(baseDir, { recursive: true, force: true });
    }
  });
});
