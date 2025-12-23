import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import z from "zod";

import { TemplateTreeBuilder } from "../src/core/templates/TemplateTreeBuilder";
import { TemplateConfigLoader } from "../src/core/templates/config/TemplateConfigLoader";
import type { CacheService } from "../src/core/infra/cache-service";
import type { GitService } from "../src/core/infra/git-service";
import type { HardenedSandboxService } from "../src/core/infra/hardened-sandbox";
import type { EsbuildInitializer } from "../src/utils/get-esbuild";
import type { GenericTemplateConfigModule } from "../src/lib/types";

async function createTempTemplateRoot(): Promise<{
  rootDir: string;
  templateDir: string;
  cleanup: () => Promise<void>;
}> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "skaff-dev-"));
  const templateDir = rootDir;
  await fs.mkdir(path.join(templateDir, "files"), { recursive: true });
  await fs.writeFile(
    path.join(templateDir, "files", "index.hbs"),
    "hello",
    "utf8",
  );
  await fs.writeFile(
    path.join(templateDir, "templateConfig.ts"),
    "export default {};",
    "utf8",
  );

  return {
    rootDir,
    templateDir,
    cleanup: async () => {
      await fs.rm(rootDir, { recursive: true, force: true });
    },
  };
}

describe("dev templates", () => {
  it("skips clean repo checks when dev mode is enabled", async () => {
    const { templateDir, cleanup } = await createTempTemplateRoot();
    try {
      const templateConfig: GenericTemplateConfigModule = {
        templateConfig: {
          name: "root",
          author: "Test",
          specVersion: "1.0.0",
        },
        templateSettingsSchema: z.object({}),
        templateFinalSettingsSchema: z.object({}),
        mapFinalSettings: ({ templateSettings }) => templateSettings,
      };

      const gitService: Pick<
        GitService,
        "isGitRepoClean" | "getCommitHash" | "getCurrentBranch"
      > = {
        isGitRepoClean: jest.fn().mockResolvedValue({ data: false }),
        getCommitHash: jest.fn().mockResolvedValue({ data: "commit" }),
        getCurrentBranch: jest.fn().mockResolvedValue({ data: "main" }),
      };

      const templateConfigLoader: Pick<
        TemplateConfigLoader,
        "loadAllTemplateConfigs"
      > = {
        loadAllTemplateConfigs: jest.fn().mockResolvedValue({
          configs: {
            "templateConfig.ts": {
              templateConfig,
              configPath: "templateConfig.ts",
            },
          },
          remoteRefs: [],
        }),
      };

      const builder = new TemplateTreeBuilder(
        gitService as GitService,
        templateConfigLoader as TemplateConfigLoader,
      );

      const result = await builder.build(templateDir, { devTemplates: true });

      expect("error" in result).toBe(false);
      expect(gitService.isGitRepoClean).not.toHaveBeenCalled();
    } finally {
      await cleanup();
    }
  });

  it("includes a dev cache buster in template config cache keys", async () => {
    const { rootDir, cleanup } = await createTempTemplateRoot();
    try {
      const cachePath = path.join(rootDir, "cached.cjs");
      await fs.writeFile(cachePath, "module.exports = {};", "utf8");

      const templateConfig: GenericTemplateConfigModule = {
        templateConfig: {
          name: "root",
          author: "Test",
          specVersion: "1.0.0",
        },
        templateSettingsSchema: z.object({}),
        templateFinalSettingsSchema: z.object({}),
        mapFinalSettings: ({ templateSettings }) => templateSettings,
      };

      const cacheService: Pick<
        CacheService,
        "hash" | "retrieveFromCache" | "saveToCache"
      > = {
        hash: jest.fn((value: string) => `hash(${value})`),
        retrieveFromCache: jest
          .fn()
          .mockResolvedValue({ data: { data: "", path: cachePath } }),
        saveToCache: jest.fn(),
      };

      const esbuildInitializer: Pick<EsbuildInitializer, "init"> = {
        init: jest.fn(),
      };

      const sandboxService: Pick<
        HardenedSandboxService,
        "evaluateCommonJs"
      > = {
        evaluateCommonJs: jest.fn(() => ({
          configs: {
            "templateConfig.ts": {
              templateConfig,
              configPath: "templateConfig.ts",
            },
          },
        })),
      };

      const loader = new TemplateConfigLoader(
        cacheService as CacheService,
        esbuildInitializer as EsbuildInitializer,
        sandboxService as HardenedSandboxService,
      );

      await loader.loadAllTemplateConfigs(rootDir, "commit", {
        devTemplates: true,
      });

      expect(cacheService.hash).toHaveBeenCalledTimes(2);
      const devHash = (cacheService.hash as jest.Mock).mock.results[0]?.value;
      const cacheKeySeed = (cacheService.hash as jest.Mock).mock.calls[1]?.[0];
      expect(cacheKeySeed).toContain("commit");
      expect(cacheKeySeed).toContain(devHash);
      const cacheKey = (cacheService.hash as jest.Mock).mock.results[1]?.value;
      expect(cacheService.retrieveFromCache).toHaveBeenCalledWith(
        "template-config",
        cacheKey,
        "cjs",
      );
    } finally {
      await cleanup();
    }
  });

  it("uses stable cache keys when dev mode is disabled", async () => {
    const { rootDir, cleanup } = await createTempTemplateRoot();
    try {
      const cachePath = path.join(rootDir, "cached.cjs");
      await fs.writeFile(cachePath, "module.exports = {};", "utf8");

      const templateConfig: GenericTemplateConfigModule = {
        templateConfig: {
          name: "root",
          author: "Test",
          specVersion: "1.0.0",
        },
        templateSettingsSchema: z.object({}),
        templateFinalSettingsSchema: z.object({}),
        mapFinalSettings: ({ templateSettings }) => templateSettings,
      };

      const cacheService: Pick<
        CacheService,
        "hash" | "retrieveFromCache" | "saveToCache"
      > = {
        hash: jest.fn((value: string) => `hash(${value})`),
        retrieveFromCache: jest
          .fn()
          .mockResolvedValue({ data: { data: "", path: cachePath } }),
        saveToCache: jest.fn(),
      };

      const esbuildInitializer: Pick<EsbuildInitializer, "init"> = {
        init: jest.fn(),
      };

      const sandboxService: Pick<
        HardenedSandboxService,
        "evaluateCommonJs"
      > = {
        evaluateCommonJs: jest.fn(() => ({
          configs: {
            "templateConfig.ts": {
              templateConfig,
              configPath: "templateConfig.ts",
            },
          },
        })),
      };

      const loader = new TemplateConfigLoader(
        cacheService as CacheService,
        esbuildInitializer as EsbuildInitializer,
        sandboxService as HardenedSandboxService,
      );

      await loader.loadAllTemplateConfigs(rootDir, "commit", {
        devTemplates: false,
      });

      expect(cacheService.hash).toHaveBeenCalledTimes(1);
      const cacheKey = (cacheService.hash as jest.Mock).mock.results[0]?.value;
      expect(cacheService.retrieveFromCache).toHaveBeenCalledWith(
        "template-config",
        cacheKey,
        "cjs",
      );
    } finally {
      await cleanup();
    }
  });
});
