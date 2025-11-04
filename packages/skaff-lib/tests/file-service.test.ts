import path from "node:path";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { withTestContainer } from "../src/di/testing";
import { makeDir } from "../src/core/infra/file-service";

jest.mock("../src/lib/logger", () => ({
  backendLogger: { error: jest.fn(), info: jest.fn() },
}));

describe("file-service", () => {
  it("creates directories recursively", async () =>
    withTestContainer(async () => {
      const base = await fs.mkdtemp(path.join(tmpdir(), "fs-test-"));
      const nested = path.join(base, "a/b/c");
      const result = await makeDir(nested);
      expect(result).toEqual({ data: undefined });
      const stat = await fs.stat(nested);
      expect(stat.isDirectory()).toBe(true);
    }),
  );

  it("returns error for invalid path", async () =>
    withTestContainer(async () => {
      const result = await makeDir("\0");
      expect(result).toHaveProperty("error");
    }),
  );
});
