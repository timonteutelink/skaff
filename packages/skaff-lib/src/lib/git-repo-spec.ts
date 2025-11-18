const GITHUB_PREFIX_PATTERN = /^(github|gh):/i;
const REMOTE_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const SCP_LIKE_PATTERN = /^[^@\s]+@[^:\s]+:/;

const COMMIT_HASH_PATTERN = /^[0-9a-f]{7,40}$/i;

function looksLikeCommitHash(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  return COMMIT_HASH_PATTERN.test(value.trim());
}

export interface NormalizedGitRepositorySpecifier {
  repoUrl: string;
  branch?: string;
  revision?: string;
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

  if (looksLikeCommitHash(branch)) {
    return { repoUrl, revision: branch };
  }

  return { repoUrl, branch };
}

interface NormalizedGithubPath {
  scheme: string;
  host: string;
  path: string;
}

function normalizeGithubRepoPath(raw: string): NormalizedGithubPath | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  const scheme = schemeMatch ? schemeMatch[1]!.toLowerCase() : "https";
  const withoutScheme = schemeMatch
    ? trimmed.slice(schemeMatch[0].length)
    : trimmed;

  const cleaned = withoutScheme
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

  let host: string;
  let pathSegments: string[];
  if (segments[0]!.includes(".") || segments[0]!.includes(":")) {
    host = segments[0]!;
    pathSegments = segments.slice(1);
    if (pathSegments.length === 0) {
      return null;
    }
  } else {
    host = "github.com";
    pathSegments = segments;
  }

  return {
    scheme,
    host,
    path: pathSegments.join("/"),
  };
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
    repoUrl: `${repoPath.scheme}://${repoPath.host}/${repoPath.path}.git`,
    branch:
      branch && !looksLikeCommitHash(branch) ? branch : undefined,
    revision: looksLikeCommitHash(branch) ? branch : undefined,
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
  | { kind: "remote"; repoUrl: string; branch?: string; revision?: string };

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
      revision: normalized.revision,
    };
  }

  return { kind: "local", path: trimmed };
}

export function normalizeCommitish(
  value?: string,
): { branch?: string; revision?: string } {
  if (!value) {
    return {};
  }
  return looksLikeCommitHash(value)
    ? { revision: value }
    : { branch: value };
}
