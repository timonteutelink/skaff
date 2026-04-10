import { describe, expect, it, jest } from "@jest/globals";
import type { ProjectSettings } from "@timonteutelink/template-types-lib";

import { TemplateValidationStage } from "../src/core/generation/pipeline/pipeline-stages";
import type { Template } from "../src/models/template";

jest.mock("../src/lib/logger", () => ({
  backendLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  },
}));

describe("TemplateValidationStage", () => {
  const projectSettings: ProjectSettings = {
    projectRepositoryName: "example",
    projectAuthor: "tester",
    rootTemplateName: "root",
    instantiatedTemplates: [],
  };

  function buildTemplate(assertions: unknown): Template {
    return {
      config: {
        templateConfig: {
          name: "assertion-template",
          author: "Test",
          specVersion: "0.0.1",
        },
        templateSettingsSchema: {} as Template["config"]["templateSettingsSchema"],
        templateFinalSettingsSchema: {} as Template["config"]["templateFinalSettingsSchema"],
        assertions,
      },
    } as Template;
  }

  it("blocks templates when assertions return false", async () => {
    const template = buildTemplate((settings: { test_boolean: boolean }) => settings.test_boolean);

    const stage = new TemplateValidationStage(projectSettings);
    const result = await stage.run({
      template,
      finalSettings: { test_boolean: false },
      parentInstanceId: undefined,
      instantiatedTemplate: {
        id: "root",
        templateName: "assertion-template",
        templateSettings: {},
      },
      userSettings: {},
      projectSettings,
    });

    expect(result).toEqual({
      error: "Template assertion-template failed assertions.",
    });
  });

  it("returns errors when assertions throw", async () => {
    const template = buildTemplate(() => {
      throw new Error("boom");
    });

    const stage = new TemplateValidationStage(projectSettings);
    const result = await stage.run({
      template,
      finalSettings: { test_boolean: true },
      parentInstanceId: undefined,
      instantiatedTemplate: {
        id: "root",
        templateName: "assertion-template",
        templateSettings: {},
      },
      userSettings: {},
      projectSettings,
    });

    expect(result).toEqual({
      error: expect.stringContaining("Error in anyOrCallbackToAny"),
    });
  });
});
