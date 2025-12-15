import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import type { ProjectSettings } from "@timonteutelink/template-types-lib";
import type { Template } from "../src/core/templates/Template";
import type { GenericTemplateConfigModule } from "../src/lib/types";
import { loadPluginsForTemplate } from "../src/core/plugins";
import { PipelineBuilder } from "../src/core/generation/pipeline/pipeline-runner";

// These tests require the full SES lockdown which is not available when running
// with Jest mocks (Jest uses Node.js domains which conflict with SES lockdown).
// We detect this by checking if the harden function was provided by SES (not our polyfill).
// When lockdown() is called, it provides a proper harden that deeply freezes objects.
// Our polyfill just uses Object.freeze which won't work for plugin sandboxing.
const hasRealSESLockdown = (() => {
  try {
    // The real SES harden deeply freezes objects, including nested properties
    // Our Object.freeze polyfill only does shallow freezing
    const test = { nested: { value: 1 } };
    const hardened = harden(test);
    // Try to modify the nested property - real harden would prevent this
    try {
      (hardened as any).nested.value = 2;
      return false; // Modification succeeded, we're using the polyfill
    } catch {
      return true; // Modification failed, we have real SES lockdown
    }
  } catch {
    return false;
  }
})();

const describeIfSES = hasRealSESLockdown ? describe : describe.skip;

function stage(name: string, priority = 0) {
  return {
    key: name,
    name,
    priority,
    async run(context: any) {
      return { data: context };
    },
  };
}

describeIfSES("plugin loading", () => {
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
        "  manifest: {",
        "    name: 'test-plugin',",
        "    version: '0.0.0',",
        "    capabilities: ['template'],",
        "    supportedHooks: { template: ['configureTemplateInstantiationPipeline'], cli: [], web: [] },",
        "    schemas: { additionalTemplateSettings: false, pluginFinalSettings: false },",
        "  },",
        "  template: ({ options }) => ({",
        "    captured: options,",
        "    configureTemplateInstantiationPipeline(builder) {",
        "      builder.insertAfter('base', {",
        "        key: 'plugin-stage',",
        "        name: 'plugin-stage',",
        "        source: 'test-plugin',",
        "        async run(ctx) { return { data: ctx }; }",
        "      });",
        "    },",
        "  }),",
        "};",
      ].join("\n"),
      "utf8",
    );

    template.config.plugins = [{ module: pluginPath, options: { flag: true } }];

    const pluginsResult = await loadPluginsForTemplate(
      template,
      projectSettings,
    );
    if ("error" in pluginsResult) {
      throw new Error(pluginsResult.error);
    }

    expect(pluginsResult.data).toHaveLength(1);
    const loaded = pluginsResult.data[0]!;
    expect((loaded.templatePlugin as any).captured).toEqual({ flag: true });

    const builder = new PipelineBuilder<any>([
      stage("base", 0),
      stage("final", 10),
    ]);
    pluginsResult.data[0]!.templatePlugin?.configureTemplateInstantiationPipeline?.(
      builder,
      {} as any,
    );

    const stages = builder.build().map((s: any) => s.name);
    expect(stages).toEqual(["base", "plugin-stage", "final"]);
  });

  it("exposes cli/web contributions and plugin-scoped settings", async () => {
    const { baseDir, template, projectSettings } =
      await createTemplateWorkspace();

    const pluginPath = path.join(baseDir, "plugin.mjs");
    await fs.writeFile(
      pluginPath,
      [
        "module.exports = {",
        "  manifest: {",
        "    name: 'test-plugin',",
        "    version: '0.0.0',",
        "    capabilities: ['template', 'cli', 'web'],",
        "    supportedHooks: { template: ['configureTemplateInstantiationPipeline'], cli: [], web: [] },",
        "    schemas: { additionalTemplateSettings: false, pluginFinalSettings: false },",
        "  },",
        "  template: {",
        "    configureTemplateInstantiationPipeline(builder) {",
        "      builder.add({",
        "        key: 'touch-settings',",
        "        name: 'touch-settings',",
        "        async run(pipelineCtx) {",
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

    template.config.plugins = [{ module: pluginPath }];

    const pluginsResult = await loadPluginsForTemplate(
      template,
      projectSettings,
    );
    if ("error" in pluginsResult) {
      throw new Error(pluginsResult.error);
    }

    const loaded = pluginsResult.data[0]!;
    expect(loaded.cliPlugin?.commands?.[0]?.name).toBe("hello");
    const notices = await loaded.webPlugin?.getNotices?.({
      projectSettings,
    });
    expect(notices).toEqual(["hello web"]);
  });

  it("blocks plugins that attempt to escape the sandbox", async () => {
    const { baseDir, template, projectSettings } =
      await createTemplateWorkspace();

    const pluginPath = path.join(baseDir, "unsafe-plugin.mjs");
    await fs.writeFile(
      pluginPath,
      [
        "module.exports = {",
        "  manifest: {",
        "    name: 'unsafe-plugin',",
        "    version: '0.0.1',",
        "    capabilities: ['template'],",
        "    supportedHooks: { template: [], cli: [], web: [] },",
        "    schemas: { additionalTemplateSettings: false, pluginFinalSettings: false },",
        "  },",
        "  template: {},",
        "  systemSettingsSchema: require('fs'),",
        "};",
      ].join("\n"),
      "utf8",
    );

    template.config.plugins = [{ module: pluginPath }];

    const pluginsResult = await loadPluginsForTemplate(
      template,
      projectSettings,
    );

    expect("error" in pluginsResult).toBe(true);
    if ("error" in pluginsResult) {
      expect(pluginsResult.error).toMatch(/Blocked import/);
    }
  });
});
