import path from "node:path";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { withTestContainer } from "../src/di/testing";

jest.mock("../src/lib/logger", () => ({
  backendLogger: { error: jest.fn(), info: jest.fn() },
}));

const { resolveFileSystemService } = require("../src/core/infra/file-service") as typeof import("../src/core/infra/file-service");

describe("file-service", () => {
  it("creates directories recursively", async () =>
    withTestContainer(async () => {
      const fileService = resolveFileSystemService();
      const base = await fs.mkdtemp(path.join(tmpdir(), "fs-test-"));
      const nested = path.join(base, "a/b/c");
      const result = await fileService.makeDir(nested);
      expect(result).toEqual({ data: undefined });
      const stat = await fs.stat(nested);
      expect(stat.isDirectory()).toBe(true);
    }),
  );

  it("returns error for invalid path", async () =>
    withTestContainer(async () => {
      const fileService = resolveFileSystemService();
      const result = await fileService.makeDir("\0");
      expect(result).toHaveProperty("error");
    }),
  );
});
