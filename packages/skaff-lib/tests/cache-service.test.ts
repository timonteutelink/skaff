import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  getHash,
  getCacheDirPath,
  pathInCache,
  saveToCache,
  retrieveFromCache,
  runEraseCache,
} from "../src/core/infra/cache-service";

describe("cache-service", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await fs.mkdtemp(path.join(tmpdir(), "skaff-test-"));
    process.env.SKAFF_CACHE_PATH = cacheDir;
  });

  afterEach(async () => {
    await runEraseCache();
    delete process.env.SKAFF_CACHE_PATH;
  });

  it("creates deterministic hashes", () => {
    expect(getHash("abc")).toBe(getHash("abc"));
    expect(getHash("abc")).not.toBe(getHash("abcd"));
  });

  it("uses environment variable for cache path", () => {
    expect(getCacheDirPath()).toBe(cacheDir);
  });

  it("saves and retrieves values from cache", async () => {
    const hash = getHash("value");
    const saveResult = await saveToCache("template-config", hash, "txt", "hello");
    expect("data" in saveResult).toBe(true);

    const retrieveResult = await retrieveFromCache(
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
  });

  it("returns null when cache entry is missing", async () => {
    const result = await retrieveFromCache("template-config", "missing", "txt");
    expect(result).toHaveProperty("data", null);
  });

  it("erases cache directory", async () => {
    const dirResult = await pathInCache("test");
    expect("data" in dirResult).toBe(true);
    await runEraseCache();
    await expect(fs.stat(cacheDir)).rejects.toThrow();
  });
});

