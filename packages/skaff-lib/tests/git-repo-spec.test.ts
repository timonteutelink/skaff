import {
  normalizeGitRepositorySpecifier,
  parseTemplatePathEntry,
} from "../src/lib/git-repo-spec";

describe("normalizeGitRepositorySpecifier", () => {
  it("normalizes github shorthand", () => {
    const result = normalizeGitRepositorySpecifier("github:owner/repo");
    expect(result).toEqual({
      repoUrl: "https://github.com/owner/repo.git",
      branch: undefined,
    });
  });

  it("supports gh shorthand with branch", () => {
    const result = normalizeGitRepositorySpecifier("gh:org/project@dev");
    expect(result).toEqual({
      repoUrl: "https://github.com/org/project.git",
      branch: "dev",
    });
  });

  it("parses branch fragments on remote URLs", () => {
    const result = normalizeGitRepositorySpecifier(
      "https://github.com/org/project.git#feature",
    );
    expect(result).toEqual({
      repoUrl: "https://github.com/org/project.git",
      branch: "feature",
    });
  });

  it("handles ssh style repositories", () => {
    const result = normalizeGitRepositorySpecifier(
      "git@github.com:org/project.git",
    );
    expect(result).toEqual({
      repoUrl: "git@github.com:org/project.git",
      branch: undefined,
    });
  });

  it("supports file scheme repositories", () => {
    const result = normalizeGitRepositorySpecifier("file:///tmp/repo#main");
    expect(result).toEqual({ repoUrl: "file:///tmp/repo", branch: "main" });
  });

  it("returns null for plain paths", () => {
    const result = normalizeGitRepositorySpecifier("./local/path");
    expect(result).toBeNull();
  });
});

describe("parseTemplatePathEntry", () => {
  it("treats github shorthand as remote", () => {
    const result = parseTemplatePathEntry("github:owner/repo@dev");
    expect(result).toEqual({
      kind: "remote",
      repoUrl: "https://github.com/owner/repo.git",
      branch: "dev",
    });
  });

  it("treats local paths as local entries", () => {
    const result = parseTemplatePathEntry("../templates");
    expect(result).toEqual({ kind: "local", path: "../templates" });
  });

  it("recognizes file scheme as remote", () => {
    const result = parseTemplatePathEntry("file:///srv/templates");
    expect(result).toEqual({
      kind: "remote",
      repoUrl: "file:///srv/templates",
      branch: undefined,
    });
  });
});
