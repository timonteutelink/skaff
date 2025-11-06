import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../src/lib/logger", () => ({
  backendLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  },
}));

type GenerationState = {
  template: any;
  finalSettings: any;
  parentInstanceId?: string;
};

class StubGenerationContext {
  private state?: GenerationState;

  constructor(initialState: GenerationState) {
    this.state = initialState;
  }

  public getState() {
    return this.state ? { data: this.state } : { error: "no state" };
  }

  public setCurrentState(state: GenerationState) {
    this.state = state;
  }
}

describe("AutoInstantiationPlanner", () => {
  it("passes instantiated final settings to child mapSettings", async () => {
    jest.resetModules();
    jest.doMock("../src/models/template", () => ({
      Template: class {},
    }));

    const { AutoInstantiationPlanner } = require("../src/core/generation/AutoInstantiationPlanner") as typeof import("../src/core/generation/AutoInstantiationPlanner");

    const parentTemplate: any = {
      config: { templateConfig: { name: "parent" }, autoInstantiatedSubtemplates: undefined },
      findSubTemplate: jest.fn(),
    };

    const childTemplate: any = {
      config: { templateConfig: { name: "child" }, autoInstantiatedSubtemplates: undefined },
      parentTemplate,
      findSubTemplate: jest.fn(),
    };

    const grandchildTemplate: any = {
      config: { templateConfig: { name: "grandchild" }, autoInstantiatedSubtemplates: undefined },
      parentTemplate: childTemplate,
      findSubTemplate: jest.fn(),
    };

    parentTemplate.findSubTemplate.mockImplementation((name: string) =>
      name === "child" ? childTemplate : undefined,
    );
    childTemplate.findSubTemplate.mockImplementation((name: string) =>
      name === "grandchild" ? grandchildTemplate : undefined,
    );

    const context = new StubGenerationContext({
      template: parentTemplate,
      finalSettings: { parent: true },
      parentInstanceId: "root-id",
    });

    const getFinalTemplateSettings = jest
      .fn()
      .mockReturnValueOnce({ data: { initial: "child" } })
      .mockReturnValueOnce({ data: { initial: "grandchild" } });

    const addNewTemplate = jest
      .fn()
      .mockReturnValueOnce({ data: "child-id" })
      .mockReturnValueOnce({ data: "grandchild-id" });

    const instantiateTemplate = jest
      .fn()
      .mockResolvedValueOnce({
        data: { targetPath: "/child", finalSettings: { final: "child" } },
      })
      .mockResolvedValueOnce({
        data: {
          targetPath: "/grandchild",
          finalSettings: { final: "grandchild" },
        },
      });

    const projectSettingsSynchronizer = {
      getFinalTemplateSettings,
      addNewTemplate,
    };

    const planner = new AutoInstantiationPlanner(
      { dontAutoInstantiate: false } as any,
      context as any,
      projectSettingsSynchronizer as any,
      instantiateTemplate,
    );

    const grandchildMapSettings = jest.fn(() => ({}));

    const subtemplates = [
      {
        subTemplateName: "child",
        mapSettings: jest.fn(() => ({})),
        children: [
          {
            subTemplateName: "grandchild",
            mapSettings: grandchildMapSettings,
          },
        ],
      },
    ];

    await planner.autoInstantiateSubTemplates(
      { parent: true },
      "parent-id",
      subtemplates as any,
    );

    expect(instantiateTemplate).toHaveBeenCalledTimes(2);
    expect(grandchildMapSettings).toHaveBeenCalledWith(
      expect.objectContaining({ final: "child" }),
    );

    jest.resetModules();
  });
});
