import { afterEach, describe, expect, it, jest } from "@jest/globals";

import {
  clearRegisteredPluginModules,
  loadPluginsForTemplate,
  registerPluginModules,
} from "../src/core/plugins";
import {
  createDefaultContainer,
  resetSkaffContainer,
  setSkaffContainer,
} from "../src/di/container";
import { createReadonlyProjectContext } from "@timonteutelink/template-types-lib";
import { createTemplateView } from "../src/core/plugins/template-view";
import { PipelineBuilder, PipelineRunner } from "../src/core/generation/pipeline/pipeline-runner";
import type { TemplateInstantiationPipelineContext } from "../src/core/generation/pipeline/pipeline-stages";
import { createLocalTestTemplateRepository } from "./helpers/template-fixtures";
import greeterPluginModule from "../../../examples/plugins/plugin-greeter/src/index";

jest.setTimeout(15000);

describe("template generation with local plugins", () => {
  afterEach(() => {
    clearRegisteredPluginModules();
    resetSkaffContainer();
  });

  it("loads the local test template and runs the greeter plugin", async () => {
    const container = createDefaultContainer();
    setSkaffContainer(container);

    const { template } = await createLocalTestTemplateRepository();
    template.config.plugins ??= [
      {
        module: "@timonteutelink/skaff-plugin-greeter",
        options: { greeting: "Hello from the test-template greeter!" },
      },
    ];

    registerPluginModules([
      {
        moduleExports: greeterPluginModule,
        packageName: "@timonteutelink/skaff-plugin-greeter",
      },
    ]);

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    try {
      const pluginsResult = await loadPluginsForTemplate(
        template,
        createReadonlyProjectContext({
          projectRepositoryName: "greeter-project",
          projectAuthor: "Test Author",
          rootTemplateName: template.config.templateConfig.name,
        }),
      );

      if ("error" in pluginsResult) {
        throw new Error(pluginsResult.error);
      }

      const templatePlugin = pluginsResult.data[0]?.templatePlugin;
      if (!templatePlugin?.configureTemplateInstantiationPipeline) {
        throw new Error("Template plugin did not register a pipeline hook.");
      }

      const builder = new PipelineBuilder<TemplateInstantiationPipelineContext>([
        {
          key: "context-setup",
          name: "context-setup",
          phase: "setup",
          priority: 10,
          source: "core",
          async run(context) {
            return { data: context };
          },
        },
      ]);

      templatePlugin.configureTemplateInstantiationPipeline(builder, {
        options: {},
        rootTemplate: createTemplateView(template),
        registerHandlebarHelpers: () => {},
      });

      const pipeline = new PipelineRunner(builder.build());
      const runResult = await pipeline.run({} as TemplateInstantiationPipelineContext);
      if ("error" in runResult) {
        throw new Error(runResult.error);
      }

      const logLines = logSpy.mock.calls
        .map((call) => call[0])
        .filter((line) => typeof line === "string");

      expect(
        logLines.some((line) =>
          line.includes("Hello from the test-template greeter!"),
        ),
      ).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });
});
