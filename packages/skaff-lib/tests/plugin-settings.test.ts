import { describe, expect, it } from "@jest/globals";
import z from "zod";

import {
  findMissingRequiredPluginSettings,
  type LoadedTemplatePlugin,
} from "../src/core/plugins";

describe("plugin required settings", () => {
  const plugin = {
    reference: { module: "test-plugin" },
    module: {
      manifest: {
        name: "test-plugin",
        version: "0.0.0",
        capabilities: ["template"],
        supportedHooks: { template: [], cli: [], web: [] },
        schemas: { input: true, output: true },
        requiredSettingsKeys: ["message", "meta.level"],
      },
    },
    name: "test-plugin",
    version: "0.0.0",
    requiredSettingsKeys: ["message", "meta.level"],
    inputSchema: z.object({
      message: z.string(),
      meta: z.object({ level: z.string() }),
    }),
    outputSchema: z.object({
      message: z.string(),
      meta: z.object({ level: z.string() }),
    }),
  } satisfies LoadedTemplatePlugin;

  it("returns missing required keys when plugin settings are incomplete", () => {
    const missing = findMissingRequiredPluginSettings([plugin], {
      name: "example",
      plugins: {
        "test-plugin": {
          message: "hello",
        },
      },
    });

    expect(missing).toEqual([
      { pluginName: "test-plugin", keys: ["meta.level"] },
    ]);
  });

  it("returns empty when required keys are provided", () => {
    const missing = findMissingRequiredPluginSettings([plugin], {
      name: "example",
      plugins: {
        "test-plugin": {
          message: "hello",
          meta: { level: "info" },
        },
      },
    });

    expect(missing).toEqual([]);
  });
});
