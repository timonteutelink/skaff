import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import type { ProjectSettings } from "@timonteutelink/template-types-lib";
import type { Template } from "../src/core/templates/Template";
import type { GenericTemplateConfigModule } from "../src/lib/types";
import { TemplatePluginSettingsStore, loadPluginsForTemplate } from "../src/core/plugins";
import { PipelineBuilder } from "../src/core/generation/pipeline/pipeline-runner";

function stage(name: string) {
  return {
    name,
    async run(context: any) {
      return { data: context };
    },
  };
}

describe("plugin loading", () => {
  const templateSettingsSchema = z.object({});
  const templateConfig: GenericTemplateConfigModule = {
    templateConfig: {
      name: "example",
      author: "Example",
      specVersion: "1.0.0",
      isRootTemplate: true,
    },
    templateSettingsSchema,
    templateFinalSettingsSchema: templateSettingsSchema,
    mapFinalSettings: ({ templateSettings }) => templateSettings,
    plugins: [],
  };

  async function createTemplateWorkspace() {
    const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "skaff-plugin-"));
    const templateDir = path.join(baseDir, "template");
    const filesDir = path.join(templateDir, "files");
    await fs.mkdir(filesDir, { recursive: true });
    await fs.writeFile(path.join(baseDir, "package.json"), "{}", "utf8");

    const template: Template = {
      config: templateConfig,
      absoluteBaseDir: baseDir,
      absoluteDir: templateDir,
      absoluteFilesDir: filesDir,
      subTemplates: {},
      findRootTemplate() {
        return this as unknown as Template;
      },
      findSubTemplate() {
        return this as unknown as Template;
      },
    } as unknown as Template;

    const projectSettings: ProjectSettings = {
      projectRepositoryName: "repo",
      projectAuthor: "example",
      rootTemplateName: templateConfig.templateConfig.name,
      instantiatedTemplates: [
        {
          id: "root",
          templateName: templateConfig.templateConfig.name,
          templateSettings: {},
        },
      ],
    };

    return { baseDir, templateDir, template, projectSettings };
  }

  it("loads template plugins and builds deterministic pipelines", async () => {
    const { baseDir, templateDir, template, projectSettings } =
      await createTemplateWorkspace();

    const pluginPath = path.join(baseDir, "plugin.mjs");
    await fs.writeFile(
      pluginPath,
      [
        "module.exports = {",
        "  template: ({ options }) => ({",
        "    captured: options,",
        "    configureTemplateInstantiationPipeline(builder) {",
        "      builder.insertAfter('base', {",
        "        name: 'plugin-stage',",
        "        async run(ctx) { return { data: ctx }; }",
        "      });",
        "    },",
        "  }),",
        "};",
      ].join("\n"),
      "utf8",
    );

    template.config.plugins = [
      { module: "./plugin.mjs", options: { flag: true } },
    ];

    const pluginsResult = await loadPluginsForTemplate(template, projectSettings);
    if ("error" in pluginsResult) {
      throw new Error(pluginsResult.error);
    }

    expect(pluginsResult.data).toHaveLength(1);
    const loaded = pluginsResult.data[0]!;
    expect((loaded.templatePlugin as any).captured).toEqual({ flag: true });

    const builder = new PipelineBuilder<any>([stage("base"), stage("final")]);
    pluginsResult.data[0]!.templatePlugin?.configureTemplateInstantiationPipeline?.(
      builder,
      {} as any,
    );

    const stages = builder.build().map((s: any) => s.name);
    expect(stages).toEqual(["base", "plugin-stage", "final"]);
  });

  it("exposes cli/web contributions and plugin-scoped settings", async () => {
    const { baseDir, template, projectSettings } = await createTemplateWorkspace();

    const pluginPath = path.join(baseDir, "plugin.mjs");
    await fs.writeFile(
      pluginPath,
      [
        "module.exports = {",
        "  name: 'test-plugin',",
        "  template: {",
        "    configureTemplateInstantiationPipeline(builder, ctx) {",
        "      builder.add({",
        "        name: 'touch-settings',",
        "        async run(pipelineCtx) {",
        "          ctx.pluginSettingsStore.setPluginSettings(pipelineCtx.instantiatedTemplate.id, 'test-plugin', { flag: true });",
        "          return { data: pipelineCtx };",
        "        }",
        "      });",
        "    }",
        "  },",
        "  cli: {",
        "    commands: [{ name: 'hello', run() {} }]",
        "  },",
        "  web: {",
        "    getNotices: () => ['hello web'],",
        "  },",
        "};",
      ].join("\n"),
      "utf8",
    );

    template.config.plugins = [{ module: "./plugin.mjs" }];

    const pluginsResult = await loadPluginsForTemplate(template, projectSettings);
    if ("error" in pluginsResult) {
      throw new Error(pluginsResult.error);
    }

    const loaded = pluginsResult.data[0]!;
    expect(loaded.cliPlugin?.commands?.[0]?.name).toBe("hello");
    const notices = await loaded.webPlugin?.getNotices?.({
      projectSettings,
      pluginSettings: new TemplatePluginSettingsStore(projectSettings),
    });
    expect(notices).toEqual(["hello web"]);
  });
});
