import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, jest } from "@jest/globals";

import {
  clearRegisteredPluginModules,
  registerPluginModules,
} from "../src/core/plugins";
import { createLocalTestTemplateRepository } from "./helpers/template-fixtures";
import greeterPluginModule from "../../../examples/plugins/plugin-greeter/src/index";

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

    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "skaff-greeter-project-"),
    );

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    try {
      const result = await template.instantiateNewProject(
        {},
        tempRoot,
        "greeter-project",
        { git: false },
      );

      if ("error" in result) {
        throw new Error(result.error);
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
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
