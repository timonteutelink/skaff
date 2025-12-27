import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, jest } from "@jest/globals";

import { HardenedSandboxService } from "../src/core/infra/hardened-sandbox";
import { TemplateConfigLoader } from "../src/core/templates/config/TemplateConfigLoader";
import { EsbuildInitializer } from "../src/utils/get-esbuild";
import type { CacheService } from "../src/core/infra/cache-service";

async function createTemplateRoot(): Promise<{
  rootDir: string;
  cleanup: () => Promise<void>;
}> {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "skaff-template-typecheck-"),
  );

  await fs.mkdir(path.join(rootDir, "files"), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, "files", "index.hbs"),
    "hello",
    "utf8",
  );
  await fs.writeFile(
    path.join(rootDir, "templateConfig.ts"),
    `import z from "zod";
import type { TemplateConfig } from "@timonteutelink/template-types-lib";

const templateSettingsSchema = z.object({
  name: z.string().default("host"),
});

const templateConfig: TemplateConfig = {
  name: "host_template",
  author: "Test Author",
  specVersion: "0.0.1",
};

export default {
  templateConfig,
  templateSettingsSchema,
  templateFinalSettingsSchema: templateSettingsSchema,
  mapFinalSettings: ({ templateSettings }: { templateSettings: { name: string } }) =>
    templateSettings,
};
`,
    "utf8",
  );

  return {
    rootDir,
    cleanup: async () => {
      await fs.rm(rootDir, { recursive: true, force: true });
    },
  };
}

describe("template config typechecking", () => {
  jest.setTimeout(30000);
  it("resolves allowed dependencies from the host installation", async () => {
    const { rootDir, cleanup } = await createTemplateRoot();
    const previousCachePath = process.env.SKAFF_CACHE_PATH;
    process.env.SKAFF_CACHE_PATH = path.join(rootDir, ".skaff-cache");

    try {
      const cacheService: Pick<
        CacheService,
        "hash" | "retrieveFromCache" | "saveToCache"
      > = {
        hash: jest.fn((value: string) => `hash(${value})`),
        retrieveFromCache: jest.fn().mockResolvedValue({ data: null }),
        saveToCache: jest.fn().mockResolvedValue({ data: "cached-path" }),
      };

      const loader = new TemplateConfigLoader(
        cacheService as CacheService,
        new EsbuildInitializer(),
        new HardenedSandboxService(),
      );

      const result = await loader.loadAllTemplateConfigs(rootDir, "commit", {
        devTemplates: false,
      });

      expect(result.configs["templateConfig.ts"]).toBeDefined();
    } finally {
      if (previousCachePath === undefined) {
        delete process.env.SKAFF_CACHE_PATH;
      } else {
        process.env.SKAFF_CACHE_PATH = previousCachePath;
      }
      await cleanup();
    }
  });
});
