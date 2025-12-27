import { describe, expect, it, jest } from "@jest/globals";
import z from "zod";

import { Project } from "../src/models/project";
import type { LoadedTemplatePlugin } from "../src/core/plugins";
import { createTestTemplate } from "./helpers/template-fixtures";

describe("project settings validation for required plugin keys", () => {
  jest.setTimeout(30000);
  it("fails when required plugin settings are missing", async () => {
    const { template } = await createTestTemplate({
      name: "required_plugin_template",
      settingsFields: { name: { type: "string", defaultValue: "demo" } },
      templateConfig: { specVersion: "1.0.0" },
      mapFinalSettingsBody:
        "({ templateSettings }: { templateSettings: { name: string } }) => templateSettings",
    });

    const plugin = {
      reference: { module: "required-plugin" },
      module: {
        manifest: {
          name: "required-plugin",
          version: "0.0.0",
          capabilities: ["template"],
          supportedHooks: { template: [], cli: [], web: [] },
          schemas: { input: true, output: true },
          requiredSettingsKeys: ["message"],
        },
      },
      name: "required-plugin",
      version: "0.0.0",
      requiredSettingsKeys: ["message"],
      inputSchema: z.object({ message: z.string() }),
      outputSchema: z.object({ message: z.string() }),
    } satisfies LoadedTemplatePlugin;

    const result = Project.getFinalTemplateSettings(
      template,
      {
        projectRepositoryName: "demo",
        projectAuthor: "Tester",
        rootTemplateName: template.config.templateConfig.name,
        instantiatedTemplates: [],
      },
      { name: "demo", plugins: { "required-plugin": {} } },
      undefined,
      { plugins: [plugin] },
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("required-plugin");
      expect(result.error).toContain("message");
    }
  });
});
