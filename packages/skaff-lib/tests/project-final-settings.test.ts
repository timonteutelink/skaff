import { describe, expect, it, jest } from "@jest/globals";
import { z } from "zod";
import type { ProjectSettings } from "@timonteutelink/template-types-lib";

import { createMockHardenedSandboxModule } from "./helpers/mock-sandbox";
import { Project } from "../src/models/project";
import type { Template } from "../src/models/template";

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

describe("Project.getFinalTemplateSettings", () => {
  const baseProjectSettings: ProjectSettings = {
    projectRepositoryName: "demo",
    projectAuthor: "tester",
    rootTemplateName: "root",
    instantiatedTemplates: [],
  };

  it("returns errors when mapFinalSettings throws", () => {
    const template = {
      config: {
        templateConfig: {
          name: "broken",
          author: "Test",
          specVersion: "0.0.1",
        },
        templateSettingsSchema: z.object({ label: z.string() }),
        templateFinalSettingsSchema: z.object({ label: z.string() }),
        mapFinalSettings: () => {
          throw new Error("boom");
        },
      },
    } as Template;

    const result = Project.getFinalTemplateSettings(
      template,
      baseProjectSettings,
      { label: "value" },
    );

    expect(result).toEqual({
      error: expect.stringContaining("Failed to map final settings"),
    });
  });

  it("returns errors when mapFinalSettings returns invalid data", () => {
    const template = {
      config: {
        templateConfig: {
          name: "invalid-final",
          author: "Test",
          specVersion: "0.0.1",
        },
        templateSettingsSchema: z.object({ label: z.string() }),
        templateFinalSettingsSchema: z.object({ label: z.string() }),
        mapFinalSettings: () => ({ label: 123 }),
      },
    } as Template;

    const result = Project.getFinalTemplateSettings(
      template,
      baseProjectSettings,
      { label: "value" },
    );

    expect(result).toEqual({
      error: expect.stringContaining("Invalid final template settings"),
    });
  });

  it("validates enum settings beyond defaults", () => {
    const template = {
      config: {
        templateConfig: {
          name: "enum-template",
          author: "Test",
          specVersion: "0.0.1",
        },
        templateSettingsSchema: z.object({
          choice: z.enum(["option1", "option2"]),
        }),
        templateFinalSettingsSchema: z.object({
          choice: z.enum(["option1", "option2"]),
        }),
        mapFinalSettings: ({ templateSettings }: { templateSettings: { choice: string } }) =>
          templateSettings,
      },
    } as Template;

    const result = Project.getFinalTemplateSettings(
      template,
      baseProjectSettings,
      { choice: "option3" },
    );

    expect(result).toEqual({
      error: expect.stringContaining("Failed to parse user settings"),
    });
  });

  it("validates array length constraints", () => {
    const template = {
      config: {
        templateConfig: {
          name: "array-template",
          author: "Test",
          specVersion: "0.0.1",
        },
        templateSettingsSchema: z.object({
          items: z.array(z.string()).min(2),
        }),
        templateFinalSettingsSchema: z.object({
          items: z.array(z.string()).min(2),
        }),
        mapFinalSettings: ({ templateSettings }: { templateSettings: { items: string[] } }) =>
          templateSettings,
      },
    } as Template;

    const result = Project.getFinalTemplateSettings(
      template,
      baseProjectSettings,
      { items: ["only-one"] },
    );

    expect(result).toEqual({
      error: expect.stringContaining("Failed to parse user settings"),
    });
  });
});
