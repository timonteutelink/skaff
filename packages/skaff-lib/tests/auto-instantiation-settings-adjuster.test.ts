import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../src/lib/logger", () => ({
  backendLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  },
}));

jest.mock("../src/models/project", () => ({
  Project: {
    getFinalTemplateSettings: jest.fn(),
  },
}));

const { Project } = require("../src/models/project") as typeof import("../src/models/project");
const { AutoInstantiationSettingsAdjuster } = require("../src/core/diffing/AutoInstantiationSettingsAdjuster") as typeof import("../src/core/diffing/AutoInstantiationSettingsAdjuster");

describe("AutoInstantiationSettingsAdjuster", () => {
  beforeEach(() => {
    (Project.getFinalTemplateSettings as jest.Mock).mockReset();
  });

  it("does not leak parent settings mutations between sibling mapSettings calls", async () => {
    const adjuster = new AutoInstantiationSettingsAdjuster();

    const parentFinalSettings = { parent: true };

    (Project.getFinalTemplateSettings as jest.Mock)
      .mockReturnValueOnce({ data: parentFinalSettings })
      .mockReturnValueOnce({ data: { child: "a" } })
      .mockReturnValueOnce({ data: { child: "b" } });

    const projectSettings: any = {
      rootTemplateName: "root",
      instantiatedTemplates: [
        {
          id: "child-a",
          templateName: "child-a",
          parentId: "parent-id",
          automaticallyInstantiatedByParent: true,
          templateSettings: {},
        },
        {
          id: "child-b",
          templateName: "child-b",
          parentId: "parent-id",
          automaticallyInstantiatedByParent: true,
          templateSettings: {},
        },
      ],
    };

    const currentTemplate: any = {
      config: {
        templateConfig: { name: "parent" },
        autoInstantiatedSubtemplates: jest.fn(),
      },
      findSubTemplate: jest.fn(),
    };

    const childTemplateA: any = {
      config: {
        templateConfig: { name: "child-a" },
        autoInstantiatedSubtemplates: undefined,
      },
      parentTemplate: currentTemplate,
      findSubTemplate: jest.fn(),
    };

    const childTemplateB: any = {
      config: {
        templateConfig: { name: "child-b" },
        autoInstantiatedSubtemplates: undefined,
      },
      parentTemplate: currentTemplate,
      findSubTemplate: jest.fn(),
    };

    currentTemplate.findSubTemplate.mockImplementation((name: string) => {
      if (name === "child-a") {
        return childTemplateA;
      }
      if (name === "child-b") {
        return childTemplateB;
      }
      return undefined;
    });

    const firstChildMapSettings = jest.fn((settings: Record<string, unknown>) => {
      (settings as Record<string, unknown>).mutated = "yes";
      return {};
    });

    const secondChildMapSettings = jest.fn(() => ({}));

    currentTemplate.config.autoInstantiatedSubtemplates.mockImplementation(
      () => [
        {
          subTemplateName: "child-a",
          mapSettings: firstChildMapSettings,
        },
        {
          subTemplateName: "child-b",
          mapSettings: secondChildMapSettings,
        },
      ],
    );

    const result = await adjuster.modifyAutoInstantiatedTemplates(
      projectSettings,
      currentTemplate,
      "parent-id",
      undefined,
      {} as any,
    );

    expect("error" in result).toBe(false);
    expect(secondChildMapSettings).toHaveBeenCalledTimes(1);
    expect(secondChildMapSettings.mock.calls[0]![0]).toEqual({ parent: true });
    expect(parentFinalSettings).toEqual({ parent: true });
  });
});
