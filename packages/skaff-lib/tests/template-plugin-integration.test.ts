import { afterEach, describe, expect, it, jest } from "@jest/globals";
import path from "node:path";

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
import greeterCliPluginModule from "../../../examples/plugins/plugin-greeter-cli/src/index";
import greeterWebPluginModule from "../../../examples/plugins/plugin-greeter-web/src/index";

jest.setTimeout(30000);

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
        modulePath: path.resolve(
          __dirname,
          "../../../examples/plugins/plugin-greeter/src/index.ts",
        ),
        packageName: "@timonteutelink/skaff-plugin-greeter",
      },
      {
        moduleExports: greeterCliPluginModule,
        modulePath: path.resolve(
          __dirname,
          "../../../examples/plugins/plugin-greeter-cli/src/index.ts",
        ),
        packageName: "@timonteutelink/skaff-plugin-greeter-cli",
      },
      {
        moduleExports: greeterWebPluginModule,
        modulePath: path.resolve(
          __dirname,
          "../../../examples/plugins/plugin-greeter-web/src/index.tsx",
        ),
        packageName: "@timonteutelink/skaff-plugin-greeter-web",
      },
    ]);

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

      const stageKeys = builder.build().map((stage) => stage.key);
      expect(stageKeys).toContain("greeter-greeting");
    } finally {
      // no-op
    }
  });
});
