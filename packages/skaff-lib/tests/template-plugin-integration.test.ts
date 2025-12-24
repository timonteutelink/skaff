import { afterEach, describe, expect, it, jest } from "@jest/globals";

import {
  clearRegisteredPluginModules,
  registerPluginModules,
} from "../src/core/plugins";
import { loadPluginsForTemplate } from "../src/core/plugins";
import { PipelineBuilder } from "../src/core/generation/pipeline/pipeline-runner";
import { createLocalTestTemplateRepository } from "./helpers/template-fixtures";
import greeterPluginModule from "../../../examples/plugins/plugin-greeter/src/index";
import { createReadonlyProjectContext } from "@timonteutelink/template-types-lib";

describe("template generation with local plugins", () => {
  afterEach(() => {
    clearRegisteredPluginModules();
  });

  it("loads the local test template and runs the greeter plugin", async () => {
    const { template } = await createLocalTestTemplateRepository();

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

      const builder = new PipelineBuilder<{ name: string }>([
        {
          key: "context-setup",
          name: "context-setup",
          async run(context) {
            return { data: context };
          },
        },
        {
          key: "final",
          name: "final",
          async run(context) {
            return { data: context };
          },
        },
      ]);

      for (const plugin of pluginsResult.data) {
        plugin.templatePlugin?.configureTemplateInstantiationPipeline?.(
          builder,
          {
            options: { absoluteDestinationPath: "/tmp" },
            rootTemplate: {
              name: template.config.templateConfig.name,
              description: template.config.templateConfig.description,
              config: template.config.templateConfig,
              subTemplateNames: [],
              isDetachedSubtreeRoot: template.isDetachedSubtreeRoot,
              commitHash: template.commitHash,
              isLocal: template.isLocal,
            },
            registerHandlebarHelpers: () => undefined,
          },
        );
      }

      const stages = builder.build();
      expect(stages.map((stage) => stage.key)).toContain("greeter-greeting");

      const pipeline = stages.reduce(
        async (current, stage) => {
          const resolved = await current;
          const result = await stage.run(resolved);
          if ("error" in result) {
            throw new Error(result.error);
          }
          return result.data;
        },
        Promise.resolve({ name: "greeter" }),
      );

      await pipeline;

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
