import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, jest } from "@jest/globals";
import { z } from "zod";

import { createMockHardenedSandboxModule } from "./helpers/mock-sandbox";
import type { GenericTemplateConfigModule } from "../src/lib/types";
import { Template } from "../src/core/templates/Template";
import { Project } from "../src/models/project";

jest.mock("../src/core/infra/hardened-sandbox", () => ({
  ...createMockHardenedSandboxModule(),
}));

jest.mock("../src/core/infra/shell-service", () => ({
  resolveShellService: jest.fn(),
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

describe("Template commands", () => {
  it("exposes template commands in DTOs", async () => {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "skaff-command-"));
    const filesDir = path.join(baseDir, "template", "files");
    await fs.mkdir(filesDir, { recursive: true });

    const schema = z.object({ message: z.string() });
    const templateConfig: GenericTemplateConfigModule = {
      templateConfig: {
        name: "command-template",
        author: "Test",
        specVersion: "0.0.1",
      },
      templateSettingsSchema: schema,
      templateFinalSettingsSchema: schema,
      mapFinalSettings: ({ templateSettings }) => templateSettings,
      commands: [
        {
          title: "Say Hello",
          description: "Echoes a greeting",
          command: (settings) => `echo ${settings.message}`,
        },
      ],
    } as GenericTemplateConfigModule;

    const template = new Template({
      config: templateConfig,
      absoluteBaseDir: baseDir,
      absoluteDir: path.join(baseDir, "template"),
      absoluteFilesDir: filesDir,
    });

    try {
      const dto = template.mapToDTO();

      expect(dto.templateCommands).toEqual([
        {
          title: "Say Hello",
          description: "Echoes a greeting",
        },
      ]);
    } finally {
      await fs.rm(baseDir, { recursive: true, force: true });
    }
  });

  it("executes template commands using final settings", async () => {
    const shellService = {
      execute: jest.fn().mockResolvedValue({ data: "ok" }),
    };

    const { resolveShellService } = jest.requireMock(
      "../src/core/infra/shell-service",
    ) as { resolveShellService: jest.Mock };
    resolveShellService.mockReturnValue(shellService);

    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "skaff-command-"));
    const filesDir = path.join(baseDir, "template", "files");
    await fs.mkdir(filesDir, { recursive: true });

    const schema = z.object({ message: z.string() });
    const templateConfig: GenericTemplateConfigModule = {
      templateConfig: {
        name: "command-template",
        author: "Test",
        specVersion: "0.0.1",
      },
      templateSettingsSchema: schema,
      templateFinalSettingsSchema: schema,
      mapFinalSettings: ({ templateSettings }) => templateSettings,
      commands: [
        {
          title: "Say Hello",
          description: "Echoes a greeting",
          command: (settings) => `echo ${settings.message}`,
        },
      ],
    } as GenericTemplateConfigModule;

    const template = new Template({
      config: templateConfig,
      absoluteBaseDir: baseDir,
      absoluteDir: path.join(baseDir, "template"),
      absoluteFilesDir: filesDir,
    });

    const projectSettings = {
      projectRepositoryName: "demo",
      projectAuthor: "tester",
      rootTemplateName: "command-template",
      instantiatedTemplates: [
        {
          id: "root-id",
          templateName: "command-template",
          templateSettings: { message: "Hello" },
        },
      ],
    };

    const projectDir = path.join(baseDir, "project");
    await fs.mkdir(projectDir, { recursive: true });
    const settingsPath = path.join(projectDir, "templateSettings.json");
    await fs.writeFile(settingsPath, JSON.stringify(projectSettings), "utf8");

    const project = new Project(
      projectDir,
      settingsPath,
      projectSettings,
      template,
    );

    try {
      const result = await project.executeTemplateCommand(
        "root-id",
        "Say Hello",
      );

      expect(result).toEqual({ data: "ok" });
      expect(shellService.execute).toHaveBeenCalledWith(
        projectDir,
        "echo Hello",
      );
    } finally {
      await fs.rm(baseDir, { recursive: true, force: true });
    }
  });
});
