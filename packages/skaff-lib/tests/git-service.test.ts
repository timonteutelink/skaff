jest.mock("node:child_process", () => ({
  execFile: jest.fn(),
  exec: jest.fn(),
}));

jest.mock("../src/lib/logger", () => ({
  backendLogger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

describe("git-service", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("detects git repository", async () => {
    const child = require("node:child_process");
    child.execFile.mockImplementation((_c: any, _a: any, _o: any, cb: any) => cb(null, { stdout: "true" }));
    const { isGitRepo } = await import("../src/services/git-service");
    const result = await isGitRepo(".");
    expect(result).toEqual({ data: true });
  });

  it("returns false when not a git repo", async () => {
    const child = require("node:child_process");
    const err: any = new Error("not repo");
    err.code = 128;
    child.execFile.mockImplementation((_c: any, _a: any, _o: any, cb: any) => cb(err));
    const { isGitRepo } = await import("../src/services/git-service");
    const result = await isGitRepo(".");
    expect(result).toEqual({ data: false });
  });

  it("returns error for other failures", async () => {
    const child = require("node:child_process");
    const err: any = new Error("boom");
    err.code = 1;
    child.execFile.mockImplementation((_c: any, _a: any, _o: any, cb: any) => cb(err));
    const { isGitRepo } = await import("../src/services/git-service");
    const result = await isGitRepo(".");
    expect(result).toHaveProperty("error");
  });
});
