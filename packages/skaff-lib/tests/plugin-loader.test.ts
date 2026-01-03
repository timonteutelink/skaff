import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import type { ProjectSettings } from "@timonteutelink/template-types-lib";
import { createReadonlyProjectContext } from "@timonteutelink/template-types-lib";
import type { Template } from "../src/core/templates/Template";
import type { GenericTemplateConfigModule } from "../src/lib/types";
import {
  clearRegisteredPluginModules,
  loadPluginsForTemplate,
  registerPluginModules,
} from "../src/core/plugins";
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
      isDetachedSubtreeRoot: false,
      isLocal: true,
      commitHash: "test-hash",
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

  async function registerPluginModule(
    pluginPath: string,
    packageName: string,
  ) {
    const moduleNamespace = await import(pathToFileURL(pluginPath).href);
    registerPluginModules([
      {
        moduleExports: moduleNamespace,
        modulePath: pluginPath,
        packageName,
      },
    ]);
  }

  afterEach(() => {
    clearRegisteredPluginModules();
  });

  it("loads template plugins and builds deterministic pipelines", async () => {
    const { baseDir, templateDir, template, projectSettings } =
      await createTemplateWorkspace();

    const pluginPath = path.join(baseDir, "plugin.cjs");
    await fs.writeFile(
      pluginPath,
      [
        "module.exports = {",
        "  manifest: {",
        "    name: 'test-plugin',",
        "    version: '0.0.0',",
        "    capabilities: ['template'],",
        "    supportedHooks: { template: ['configureTemplateInstantiationPipeline'], cli: [], web: [] },",
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

    const packageName = "test-plugin-package";
    await registerPluginModule(pluginPath, packageName);

    template.config.plugins = [
      { module: packageName, options: { flag: true } },
    ];

    const pluginsResult = await loadPluginsForTemplate(
      template,
      createReadonlyProjectContext(projectSettings),
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

  it("does not expose filesystem paths or instantiated templates to plugins", async () => {
    const { baseDir, template, projectSettings } =
      await createTemplateWorkspace();

    const pluginPath = path.join(baseDir, "path-guard-plugin.cjs");
    await fs.writeFile(
      pluginPath,
      [
        "module.exports = {",
        "  manifest: {",
        "    name: 'path-guard-plugin',",
        "    version: '0.0.0',",
        "    capabilities: ['template'],",
        "    supportedHooks: { template: [], cli: [], web: [] },",
        "  },",
        "  template: ({ template, projectContext }) => ({",
        "    captured: {",
        "      hasAbsoluteDir: Boolean(template.absoluteDir),",
        "      hasAbsoluteBaseDir: Boolean(template.absoluteBaseDir),",
        "      hasFilesDir: Boolean(template.absoluteFilesDir),",
        "      hasInstantiatedTemplates: 'instantiatedTemplates' in projectContext,",
        "    },",
        "  }),",
        "};",
      ].join("\n"),
      "utf8",
    );

    const packageName = "path-guard-plugin-package";
    await registerPluginModule(pluginPath, packageName);

    template.config.plugins = [{ module: packageName }];

    const pluginsResult = await loadPluginsForTemplate(
      template,
      createReadonlyProjectContext(projectSettings),
    );
    if ("error" in pluginsResult) {
      throw new Error(pluginsResult.error);
    }

    const loaded = pluginsResult.data[0]!;
    expect((loaded.templatePlugin as any).captured).toEqual({
      hasAbsoluteDir: false,
      hasAbsoluteBaseDir: false,
      hasFilesDir: false,
      hasInstantiatedTemplates: false,
    });
  });

  it("exposes cli/web contributions and plugin-scoped settings", async () => {
    const { baseDir, template, projectSettings } =
      await createTemplateWorkspace();

    const pluginPath = path.join(baseDir, "plugin.cjs");
    await fs.writeFile(
      pluginPath,
      [
        "module.exports = {",
        "  manifest: {",
        "    name: 'test-plugin',",
        "    version: '0.0.0',",
        "    capabilities: ['template', 'cli', 'web'],",
        "    supportedHooks: { template: ['configureTemplateInstantiationPipeline'], cli: [], web: [] },",
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

    const packageName = "test-plugin-package";
    await registerPluginModule(pluginPath, packageName);

    template.config.plugins = [{ module: packageName }];

    const pluginsResult = await loadPluginsForTemplate(
      template,
      createReadonlyProjectContext(projectSettings),
    );
    if ("error" in pluginsResult) {
      throw new Error(pluginsResult.error);
    }

    const loaded = pluginsResult.data[0]!;
    expect(loaded.cliPlugin?.commands?.[0]?.name).toBe("hello");
    const notices = await loaded.webPlugin?.getNotices?.({
      projectRepositoryName: projectSettings.projectRepositoryName,
      projectAuthor: projectSettings.projectAuthor,
      rootTemplateName: projectSettings.rootTemplateName,
      rootTemplate: {
        name: template.config.templateConfig.name,
        author: template.config.templateConfig.author,
        specVersion: template.config.templateConfig.specVersion,
        subTemplateNames: Object.keys(template.subTemplates || {}),
      },
    });
    expect(notices).toEqual(["hello web"]);
  });

  it("rejects plugins with blocked imports in sandboxed exports", async () => {
    const { baseDir, template, projectSettings } =
      await createTemplateWorkspace();

    const pluginPath = path.join(baseDir, "unsafe-plugin.cjs");
    await fs.writeFile(
      pluginPath,
      [
        "module.exports = {",
        "  manifest: {",
        "    name: 'unsafe-plugin',",
        "    version: '0.0.1',",
        "    capabilities: ['template'],",
        "    supportedHooks: { template: [], cli: [], web: [] },",
        "  },",
        "  template: {},",
        "  globalConfigSchema: require('fs'),",
        "};",
      ].join("\n"),
      "utf8",
    );

    const packageName = "unsafe-plugin-package";
    await registerPluginModule(pluginPath, packageName);

    template.config.plugins = [{ module: packageName }];

    const pluginsResult = await loadPluginsForTemplate(
      template,
      createReadonlyProjectContext(projectSettings),
    );

    expect("error" in pluginsResult).toBe(true);
    if ("error" in pluginsResult) {
      expect(pluginsResult.error).toMatch(/Blocked import in sandbox/);
    }
  });
});
