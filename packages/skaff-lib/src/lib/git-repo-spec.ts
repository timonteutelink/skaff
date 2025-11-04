const GITHUB_PREFIX_PATTERN = /^(github|gh):/i;
const REMOTE_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const SCP_LIKE_PATTERN = /^[^@\s]+@[^:\s]+:/;

export interface NormalizedGitRepositorySpecifier {
  repoUrl: string;
  branch?: string;
}

function extractBranchSuffix(
  spec: string,
): NormalizedGitRepositorySpecifier | null {
  let repoUrl = spec.trim();
  if (!repoUrl) {
    return null;
  }

  let branch: string | undefined;

  const hashIndex = repoUrl.lastIndexOf("#");
  if (hashIndex !== -1) {
    const possibleBranch = repoUrl.slice(hashIndex + 1).trim();
    repoUrl = repoUrl.slice(0, hashIndex).trim();
    if (possibleBranch.length > 0) {
      branch = possibleBranch;
    }
  }

  if (!repoUrl) {
    return null;
  }

  return { repoUrl, branch };
}

function normalizeGithubRepoPath(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^\/+/, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/g, "");

  if (!cleaned) {
    return null;
  }

  const segments = cleaned.split("/").filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  return segments.join("/");
}

function parseGithubSpecifier(
  raw: string,
): NormalizedGitRepositorySpecifier | null {
  const remainder = raw.replace(GITHUB_PREFIX_PATTERN, "");
  const match = remainder.match(/^(?<repo>[^@#]+)(?:[@#](?<branch>.+))?$/);
  if (!match || !match.groups) {
    return null;
  }

  const repoPath = normalizeGithubRepoPath(match.groups.repo ?? "");
  if (!repoPath) {
    return null;
  }

  const branch = match.groups.branch?.trim();
  return {
    repoUrl: `https://github.com/${repoPath}.git`,
    branch: branch ? branch : undefined,
  };
}

function parseExplicitRemote(
  raw: string,
): NormalizedGitRepositorySpecifier | null {
  const normalized = extractBranchSuffix(raw);
  if (!normalized) {
    return null;
  }

  return normalized.repoUrl ? normalized : null;
}

export function normalizeGitRepositorySpecifier(
  raw: string,
): NormalizedGitRepositorySpecifier | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (GITHUB_PREFIX_PATTERN.test(trimmed)) {
    return parseGithubSpecifier(trimmed);
  }

  if (REMOTE_SCHEME_PATTERN.test(trimmed) || SCP_LIKE_PATTERN.test(trimmed)) {
    return parseExplicitRemote(trimmed);
  }

  return null;
}

export type TemplatePathEntry =
  | { kind: "local"; path: string }
  | { kind: "remote"; repoUrl: string; branch?: string };

export function parseTemplatePathEntry(raw: string): TemplatePathEntry | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = normalizeGitRepositorySpecifier(trimmed);
  if (normalized) {
    return {
      kind: "remote",
      repoUrl: normalized.repoUrl,
      branch: normalized.branch,
    };
  }

  return { kind: "local", path: trimmed };
}
