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

type PipelineState = {
  template: any;
  finalSettings: any;
  parentInstanceId?: string;
};

class StubPipelineContext {
  private state?: PipelineState;

  constructor(initialState: PipelineState) {
    this.state = initialState;
  }

  public getState() {
    return this.state ? { data: this.state } : { error: "no state" };
  }

  public setCurrentState(state: PipelineState) {
    this.state = state;
  }
}

describe("AutoInstantiationCoordinator", () => {
  it("passes instantiated final settings to child mapSettings", async () => {
    jest.resetModules();
    jest.doMock("../src/models/template", () => ({
      Template: class {},
    }));

    const { AutoInstantiationCoordinator } = require("../src/core/generation/pipeline/AutoInstantiationCoordinator") as typeof import("../src/core/generation/pipeline/AutoInstantiationCoordinator");

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

    const context = new StubPipelineContext({
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

    const loadPluginsForTemplate = jest
      .fn()
      .mockResolvedValue({ data: [] as any[] });

    const planner = new AutoInstantiationCoordinator(
      { dontAutoInstantiate: false } as any,
      context as any,
      projectSettingsSynchronizer as any,
      loadPluginsForTemplate,
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

  it("stores auto-generated user settings in project settings", async () => {
    jest.resetModules();
    jest.doMock("../src/models/template", () => ({
      Template: class {},
    }));

    const { AutoInstantiationCoordinator } = require("../src/core/generation/pipeline/AutoInstantiationCoordinator") as typeof import("../src/core/generation/pipeline/AutoInstantiationCoordinator");

    const parentTemplate: any = {
      config: {
        templateConfig: { name: "parent" },
        autoInstantiatedSubtemplates: undefined,
      },
      findSubTemplate: jest.fn(),
    };

    const childTemplate: any = {
      config: {
        templateConfig: { name: "child" },
        autoInstantiatedSubtemplates: undefined,
      },
      parentTemplate,
      findSubTemplate: jest.fn(),
    };

    parentTemplate.findSubTemplate.mockReturnValue(childTemplate);

    const context = new StubPipelineContext({
      template: parentTemplate,
      finalSettings: { parent: true },
      parentInstanceId: "root-id",
    });

    const childUserSettings = { inputOnly: "value" };
    const childFinalSettings = { inputOnly: "value", derived: "extra" };

    const getFinalTemplateSettings = jest
      .fn()
      .mockReturnValue({ data: childFinalSettings });

    const addNewTemplate = jest
      .fn()
      .mockReturnValue({ data: "child-id" });

    const instantiateTemplate = jest.fn().mockResolvedValue({
      data: { targetPath: "/child", finalSettings: childFinalSettings },
    });

    const projectSettingsSynchronizer = {
      getFinalTemplateSettings,
      addNewTemplate,
    };

    const loadPluginsForTemplate = jest
      .fn()
      .mockResolvedValue({ data: [] as any[] });

    const planner = new AutoInstantiationCoordinator(
      { dontAutoInstantiate: false } as any,
      context as any,
      projectSettingsSynchronizer as any,
      loadPluginsForTemplate,
      instantiateTemplate,
    );

    const subtemplates = [
      {
        subTemplateName: "child",
        mapSettings: jest.fn(() => childUserSettings),
      },
    ];

    await planner.autoInstantiateSubTemplates(
      { parent: true },
      "parent-id",
      subtemplates as any,
    );

    expect(addNewTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ inputOnly: "value" }),
      "child",
      "parent-id",
      true,
    );

    const persistedSettings = addNewTemplate.mock.calls[0]![0];
    expect(persistedSettings).not.toHaveProperty("derived");

    jest.resetModules();
  });

  it("does not leak parent settings mutations between sibling mapSettings calls", async () => {
    jest.resetModules();
    jest.doMock("../src/models/template", () => ({
      Template: class {},
    }));

    const { AutoInstantiationCoordinator } = require("../src/core/generation/pipeline/AutoInstantiationCoordinator") as typeof import("../src/core/generation/pipeline/AutoInstantiationCoordinator");

    const parentTemplate: any = {
      config: { templateConfig: { name: "parent" }, autoInstantiatedSubtemplates: undefined },
      findSubTemplate: jest.fn(),
    };

    const childTemplateA: any = {
      config: { templateConfig: { name: "child-a" }, autoInstantiatedSubtemplates: undefined },
      parentTemplate,
      findSubTemplate: jest.fn(),
    };

    const childTemplateB: any = {
      config: { templateConfig: { name: "child-b" }, autoInstantiatedSubtemplates: undefined },
      parentTemplate,
      findSubTemplate: jest.fn(),
    };

    parentTemplate.findSubTemplate.mockImplementation((name: string) => {
      if (name === "child-a") {
        return childTemplateA;
      }
      if (name === "child-b") {
        return childTemplateB;
      }
      return undefined;
    });

    const parentFinalSettings = { parent: true };

    const context = new StubPipelineContext({
      template: parentTemplate,
      finalSettings: parentFinalSettings,
      parentInstanceId: "root-id",
    });

    const getFinalTemplateSettings = jest
      .fn()
      .mockReturnValueOnce({ data: { initial: "child-a" } })
      .mockReturnValueOnce({ data: { initial: "child-b" } });

    const addNewTemplate = jest
      .fn()
      .mockReturnValueOnce({ data: "child-a-id" })
      .mockReturnValueOnce({ data: "child-b-id" });

    const instantiateTemplate = jest
      .fn()
      .mockResolvedValueOnce({
        data: { targetPath: "/child-a", finalSettings: { final: "child-a" } },
      })
      .mockResolvedValueOnce({
        data: { targetPath: "/child-b", finalSettings: { final: "child-b" } },
      });

    const projectSettingsSynchronizer = {
      getFinalTemplateSettings,
      addNewTemplate,
    };

    const loadPluginsForTemplate = jest
      .fn()
      .mockResolvedValue({ data: [] as any[] });

    const planner = new AutoInstantiationCoordinator(
      { dontAutoInstantiate: false } as any,
      context as any,
      projectSettingsSynchronizer as any,
      loadPluginsForTemplate,
      instantiateTemplate,
    );

    const firstChildMapSettings = jest.fn((settings: Record<string, unknown>) => {
      (settings as Record<string, unknown>).mutated = "yes";
      return {};
    });

    const secondChildMapSettings = jest.fn(() => ({}));

    const subtemplates = [
      {
        subTemplateName: "child-a",
        mapSettings: firstChildMapSettings,
      },
      {
        subTemplateName: "child-b",
        mapSettings: secondChildMapSettings,
      },
    ];

    await planner.autoInstantiateSubTemplates(
      parentFinalSettings,
      "parent-id",
      subtemplates as any,
    );

    expect(firstChildMapSettings).toHaveBeenCalledTimes(1);
    expect(secondChildMapSettings).toHaveBeenCalledTimes(1);
    expect(secondChildMapSettings.mock.calls[0]![0]).toEqual({ parent: true });
    expect(parentFinalSettings).toEqual({ parent: true });

    jest.resetModules();
  });

  it("delegates child auto-instantiation to instantiateTemplate", async () => {
    jest.resetModules();
    jest.doMock("../src/models/template", () => ({
      Template: class {},
    }));

    const { AutoInstantiationCoordinator } = require("../src/core/generation/pipeline/AutoInstantiationCoordinator") as typeof import("../src/core/generation/pipeline/AutoInstantiationCoordinator");

    const parentTemplate: any = {
      config: {
        templateConfig: { name: "parent" },
        autoInstantiatedSubtemplates: undefined,
      },
      findSubTemplate: jest.fn(),
    };

    const childTemplate: any = {
      config: {
        templateConfig: { name: "child" },
        autoInstantiatedSubtemplates: [
          {
            subTemplateName: "grandchild",
            mapSettings: jest.fn(() => ({ grandchild: true })),
          },
        ],
      },
      parentTemplate,
      findSubTemplate: jest.fn(),
    };

    const grandchildTemplate: any = {
      config: {
        templateConfig: { name: "grandchild" },
        autoInstantiatedSubtemplates: undefined,
      },
      parentTemplate: childTemplate,
      findSubTemplate: jest.fn(),
    };

    parentTemplate.findSubTemplate.mockImplementation((name: string) => {
      if (name === "child") {
        return childTemplate;
      }
      return undefined;
    });

    childTemplate.findSubTemplate.mockImplementation((name: string) => {
      if (name === "grandchild") {
        return grandchildTemplate;
      }
      return undefined;
    });

    const context = new StubPipelineContext({
      template: parentTemplate,
      finalSettings: { parent: true },
      parentInstanceId: "root-id",
    });

    const childFinalSettings = { child: true };
    const grandchildFinalSettings = { grandchild: true };

    const getFinalTemplateSettings = jest
      .fn()
      .mockReturnValueOnce({ data: childFinalSettings })
      .mockReturnValueOnce({ data: grandchildFinalSettings });

    const addNewTemplate = jest
      .fn()
      .mockReturnValueOnce({ data: "child-id" })
      .mockReturnValueOnce({ data: "grandchild-id" });

    let plannerRef: import("../src/core/generation/pipeline/AutoInstantiationCoordinator").AutoInstantiationCoordinator;

    const instantiateTemplate = jest.fn(async (templateInstanceId: string) => {
      const currentStateResult = context.getState();
      const previousState = "error" in currentStateResult ? undefined : currentStateResult.data;

      if (templateInstanceId === "child-id") {
        const childState = {
          template: childTemplate,
          finalSettings: childFinalSettings,
          parentInstanceId: "parent-id",
        };

        context.setCurrentState(childState);

        const templatesToAutoInstantiateResult =
          plannerRef.getTemplatesToAutoInstantiateForCurrentTemplate();

        if ("error" in templatesToAutoInstantiateResult) {
          return templatesToAutoInstantiateResult;
        }

        if (templatesToAutoInstantiateResult.data.length) {
          const autoInstantiationResult = await plannerRef.autoInstantiateSubTemplates(
            childFinalSettings,
            "child-id",
            templatesToAutoInstantiateResult.data,
          );

          if ("error" in autoInstantiationResult) {
            return autoInstantiationResult;
          }
        }

        if (previousState) {
          context.setCurrentState(previousState);
        }

        return {
          data: { targetPath: "/child", finalSettings: childFinalSettings },
        };
      }

      if (templateInstanceId === "grandchild-id") {
        const grandchildState = {
          template: grandchildTemplate,
          finalSettings: grandchildFinalSettings,
          parentInstanceId: "child-id",
        };

        context.setCurrentState(grandchildState);

        if (previousState) {
          context.setCurrentState(previousState);
        }

        return {
          data: {
            targetPath: "/grandchild",
            finalSettings: grandchildFinalSettings,
          },
        };
      }

      throw new Error(`Unexpected template instance id ${templateInstanceId}`);
    });

    const projectSettingsSynchronizer = {
      getFinalTemplateSettings,
      addNewTemplate,
    };

    const loadPluginsForTemplate = jest
      .fn()
      .mockResolvedValue({ data: [] as any[] });

    const planner = new AutoInstantiationCoordinator(
      { dontAutoInstantiate: false } as any,
      context as any,
      projectSettingsSynchronizer as any,
      loadPluginsForTemplate,
      instantiateTemplate,
    );

    plannerRef = planner;

    const subtemplates = [
      {
        subTemplateName: "child",
        mapSettings: jest.fn(() => ({ child: true })),
      },
    ];

    await planner.autoInstantiateSubTemplates(
      { parent: true },
      "parent-id",
      subtemplates as any,
    );

    expect(addNewTemplate).toHaveBeenCalledTimes(2);
    expect(addNewTemplate.mock.calls[1]![1]).toBe("grandchild");
    expect(instantiateTemplate).toHaveBeenCalledTimes(2);

    jest.resetModules();
  });
});
