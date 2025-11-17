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
      revision: undefined,
    });
  });

  it("supports gh shorthand with branch", () => {
    const result = normalizeGitRepositorySpecifier("gh:org/project@dev");
    expect(result).toEqual({
      repoUrl: "https://github.com/org/project.git",
      branch: "dev",
      revision: undefined,
    });
  });

  it("supports overriding the GitHub host", () => {
    const result = normalizeGitRepositorySpecifier(
      "github:github.example.com/org/project",
    );
    expect(result).toEqual({
      repoUrl: "https://github.example.com/org/project.git",
      branch: undefined,
      revision: undefined,
    });
  });

  it("preserves explicit schemes in github shorthand", () => {
    const result = normalizeGitRepositorySpecifier(
      "github:http://github.example.com/org/project@release",
    );
    expect(result).toEqual({
      repoUrl: "http://github.example.com/org/project.git",
      branch: "release",
      revision: undefined,
    });
  });

  it("parses branch fragments on remote URLs", () => {
    const result = normalizeGitRepositorySpecifier(
      "https://github.com/org/project.git#feature",
    );
    expect(result).toEqual({
      repoUrl: "https://github.com/org/project.git",
      branch: "feature",
      revision: undefined,
    });
  });

  it("handles ssh style repositories", () => {
    const result = normalizeGitRepositorySpecifier(
      "git@github.com:org/project.git",
    );
    expect(result).toEqual({
      repoUrl: "git@github.com:org/project.git",
      branch: undefined,
      revision: undefined,
    });
  });

  it("supports file scheme repositories", () => {
    const result = normalizeGitRepositorySpecifier("file:///tmp/repo#main");
    expect(result).toEqual({
      repoUrl: "file:///tmp/repo",
      branch: "main",
      revision: undefined,
    });
  });

  it("detects commit hashes as revisions", () => {
    const sha = "abcdef1234567890abcdef1234567890abcdef12";
    const result = normalizeGitRepositorySpecifier(`github:owner/repo@${sha}`);
    expect(result).toEqual({
      repoUrl: "https://github.com/owner/repo.git",
      branch: undefined,
      revision: sha,
    });
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
      revision: undefined,
    });
  });

  it("treats github host overrides as remote", () => {
    const result = parseTemplatePathEntry(
      "github:github.example.com/org/project",
    );
    expect(result).toEqual({
      kind: "remote",
      repoUrl: "https://github.example.com/org/project.git",
      branch: undefined,
      revision: undefined,
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
      revision: undefined,
    });
  });

  it("captures revision fragments", () => {
    const sha = "abcdef1234567890abcdef1234567890abcdef12";
    const result = parseTemplatePathEntry(`https://example.com/repo.git#${sha}`);
    expect(result).toEqual({
      kind: "remote",
      repoUrl: "https://example.com/repo.git",
      branch: undefined,
      revision: sha,
    });
  });
});
