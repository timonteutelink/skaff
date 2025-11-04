import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { withTestContainer } from "../src/di/testing";
import { CacheService } from "../src/core/infra/cache-service";

jest.mock("../src/lib/logger", () => ({
  backendLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  },
}));

const { resolveCacheService } = require("../src/core/infra/cache-service") as typeof import("../src/core/infra/cache-service");

describe("cache-service", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(tmpdir(), "skaff-test-"));
    process.env.SKAFF_CACHE_PATH = cacheDir;
  });

  afterEach(async () => {
    await withTestContainer(async () => {
      const cacheService = resolveCacheService();
      await cacheService.runEraseCache();
    });
    delete process.env.SKAFF_CACHE_PATH;
  });

  it("creates deterministic hashes", async () =>
    withTestContainer(async () => {
      const cacheService = resolveCacheService();
      expect(cacheService.hash("abc")).toBe(cacheService.hash("abc"));
      expect(cacheService.hash("abc")).not.toBe(cacheService.hash("abcd"));
    }),
  );

  it("uses environment variable for cache path", async () =>
    withTestContainer(async () => {
      expect(CacheService.getCacheDirPath()).toBe(cacheDir);
    }),
  );

  it("saves and retrieves values from cache", async () =>
    withTestContainer(async () => {
      const cacheService = resolveCacheService();
      const hash = cacheService.hash("value");
      const saveResult = await cacheService.saveToCache(
        "template-config",
        hash,
        "txt",
        "hello",
      );
      expect("data" in saveResult).toBe(true);

      const retrieveResult = await cacheService.retrieveFromCache(
        "template-config",
        hash,
        "txt",
      );
      expect(retrieveResult).toHaveProperty("data");
      if ("data" in retrieveResult) {
        expect(retrieveResult.data?.data).toBe("hello\n");
        const exists = await fs.stat(retrieveResult.data.path);
        expect(exists.isFile()).toBe(true);
      }
    }),
  );

  it("returns null when cache entry is missing", async () =>
    withTestContainer(async () => {
      const cacheService = resolveCacheService();
      const result = await cacheService.retrieveFromCache(
        "template-config",
        "missing",
        "txt",
      );
      expect(result).toHaveProperty("data", null);
    }),
  );

  it("erases cache directory", async () =>
    withTestContainer(async () => {
      const cacheService = resolveCacheService();
      const dirResult = await cacheService.pathInCache("test");
      expect("data" in dirResult).toBe(true);
      await cacheService.runEraseCache();
      await expect(fs.stat(cacheDir)).rejects.toThrow();
    }),
  );
});

