import { withTestContainer } from "../src/di/testing";
import { resolveGitService } from "../src/core/infra/git-service";

jest.mock("../src/lib/logger", () => ({
  backendLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  },
}));

const mockCheckIsRepo = jest.fn();
const mockSimpleGit = jest.fn();

jest.mock("simple-git", () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockSimpleGit(...args),
}));

jest.mock("../src/lib/utils", () => ({
  logError: jest.fn(),
}));

describe("git-service", () => {
  beforeEach(() => {
    jest.resetModules();
    mockSimpleGit.mockReset();
    mockCheckIsRepo.mockReset();
    mockSimpleGit.mockImplementation(() => ({
      checkIsRepo: mockCheckIsRepo,
    }));
  });

  it("detects git repository", async () => {
    await withTestContainer(async () => {
      const gitService = resolveGitService();
      mockCheckIsRepo.mockResolvedValue(true);
      const result = await gitService.isGitRepo(".");
      expect(result).toEqual({ data: true });
    });
  });

  it("returns false when not a git repo", async () => {
    const err: any = new Error("not repo");
    err.exitCode = 128;
    mockCheckIsRepo.mockRejectedValue(err);
    await withTestContainer(async () => {
      const gitService = resolveGitService();
      const result = await gitService.isGitRepo(".");
      expect(result).toEqual({ data: false });
    });
  });

  it("returns error for other failures", async () => {
    const err: any = new Error("boom");
    err.exitCode = 1;
    mockCheckIsRepo.mockRejectedValue(err);
    await withTestContainer(async () => {
      const gitService = resolveGitService();
      const result = await gitService.isGitRepo(".");
      expect(result).toHaveProperty("error");
    });
  });
});
