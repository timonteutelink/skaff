/**
 * Plugin Trust Verification
 *
 * This module provides functions to verify plugin trust levels by checking
 * npm provenance attestations and registry information.
 *
 * npm provenance provides:
 * - Build attestation: Proof the package was built by a specific CI workflow
 * - Source link: Connection to source repository commit
 * - Tamper detection: Any modification breaks attestation
 *
 * Trust levels are informational only - they warn users but don't block installation.
 */

import {
  type PluginTrustInfo,
  type PluginTrustLevel,
  determinePluginTrust,
  isOfficialPlugin,
  OFFICIAL_PLUGIN_SCOPES,
} from "./plugin-types";
import { parsePackageSpec } from "./package-spec";

/**
 * npm registry package metadata response (partial).
 */
interface NpmPackageMetadata {
  name: string;
  version: string;
  dist?: {
    tarball?: string;
    integrity?: string;
    attestations?: {
      url: string;
      provenance: {
        predicateType: string;
      };
    };
  };
  repository?: {
    type?: string;
    url?: string;
  };
}

/**
 * npm provenance attestation bundle.
 */
interface NpmProvenanceAttestation {
  predicateType: string;
  predicate?: {
    buildType?: string;
    builder?: {
      id?: string;
    };
    invocation?: {
      configSource?: {
        uri?: string;
        digest?: {
          sha1?: string;
        };
        entryPoint?: string;
      };
    };
    materials?: Array<{
      uri?: string;
      digest?: Record<string, string>;
    }>;
  };
}

/**
 * Result of fetching provenance information.
 */
export interface ProvenanceResult {
  /** Whether provenance was found and valid */
  hasProvenance: boolean;
  /** Source repository URL */
  sourceRepository?: string;
  /** Build workflow that produced the package */
  buildWorkflow?: string;
  /** Commit SHA the package was built from */
  commitSha?: string;
  /** Error message if provenance check failed */
  error?: string;
}

/**
 * Fetches package metadata from npm registry.
 */
async function fetchNpmPackageMetadata(
  packageName: string,
  version?: string,
  registry = "https://registry.npmjs.org",
): Promise<NpmPackageMetadata | null> {
  try {
    const url = version
      ? `${registry}/${packageName}/${version}`
      : `${registry}/${packageName}/latest`;

    const response = await fetch(url, {
      headers: {
        Accept:
          "application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8",
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as NpmPackageMetadata;
  } catch {
    return null;
  }
}

/**
 * Fetches provenance attestation for a package version.
 */
async function fetchProvenanceAttestation(
  packageName: string,
  version: string,
  registry = "https://registry.npmjs.org",
): Promise<NpmProvenanceAttestation | null> {
  try {
    // npm provenance attestations are available at a specific endpoint
    const url = `${registry}/-/npm/v1/attestations/${encodeURIComponent(packageName)}@${version}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // The attestations endpoint returns an array of attestations
    if (data?.attestations?.length > 0) {
      // Find the provenance attestation
      for (const att of data.attestations) {
        if (att.predicateType?.includes("provenance")) {
          return att as NpmProvenanceAttestation;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Checks npm provenance for a package.
 *
 * @param packageSpec - Package name with optional version (e.g., "@scope/pkg@1.0.0")
 * @param registry - npm registry URL (defaults to public npm)
 * @returns Provenance result with source repository info if available
 */
export async function checkNpmProvenance(
  packageSpec: string,
  registry = "https://registry.npmjs.org",
): Promise<ProvenanceResult> {
  try {
    const { name: packageName, version: requestedVersion } =
      parsePackageSpec(packageSpec);
    let version = requestedVersion;

    // If no version specified, get latest
    if (!version) {
      const metadata = await fetchNpmPackageMetadata(
        packageName,
        undefined,
        registry,
      );
      if (!metadata?.version) {
        return {
          hasProvenance: false,
          error: `Could not fetch package metadata for ${packageName}`,
        };
      }
      version = metadata.version;
    }

    // Fetch provenance attestation
    const attestation = await fetchProvenanceAttestation(
      packageName,
      version,
      registry,
    );

    if (!attestation) {
      return {
        hasProvenance: false,
      };
    }

    // Extract provenance information
    const sourceUri = attestation.predicate?.invocation?.configSource?.uri;
    const commitDigest =
      attestation.predicate?.invocation?.configSource?.digest?.sha1;
    const buildWorkflow =
      attestation.predicate?.invocation?.configSource?.entryPoint;

    // Also check materials for source repository
    let sourceRepo = sourceUri;
    if (!sourceRepo && attestation.predicate?.materials?.length) {
      const gitMaterial = attestation.predicate.materials.find(
        (m) => m.uri?.startsWith("git+") || m.uri?.includes("github.com"),
      );
      if (gitMaterial?.uri) {
        sourceRepo = gitMaterial.uri;
      }
    }

    return {
      hasProvenance: true,
      sourceRepository: sourceRepo,
      buildWorkflow,
      commitSha: commitDigest,
    };
  } catch (error) {
    return {
      hasProvenance: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error checking provenance",
    };
  }
}

/**
 * Gets complete trust information for a plugin, including provenance check.
 *
 * @param packageSpec - Package name with optional version
 * @param options - Additional options
 * @returns Complete trust information
 */
export async function getPluginTrustInfo(
  packageSpec: string,
  options: {
    registry?: string;
    skipProvenanceCheck?: boolean;
  } = {},
): Promise<PluginTrustInfo> {
  const { name: packageName } = parsePackageSpec(packageSpec);
  const registry = options.registry ?? "https://registry.npmjs.org";

  // For official plugins, we trust them regardless of provenance
  if (isOfficialPlugin(packageName)) {
    // Still check provenance for informational purposes
    let provenance: ProvenanceResult = { hasProvenance: false };
    if (!options.skipProvenanceCheck) {
      provenance = await checkNpmProvenance(packageSpec, registry);
    }

    return determinePluginTrust(packageName, {
      hasProvenance: provenance.hasProvenance,
      sourceRepository: provenance.sourceRepository,
      buildWorkflow: provenance.buildWorkflow,
      commitSha: provenance.commitSha,
      registry,
    });
  }

  // For non-official plugins, check provenance
  if (options.skipProvenanceCheck) {
    return determinePluginTrust(packageName, { registry });
  }

  const provenance = await checkNpmProvenance(packageSpec, registry);

  return determinePluginTrust(packageName, {
    hasProvenance: provenance.hasProvenance,
    sourceRepository: provenance.sourceRepository,
    buildWorkflow: provenance.buildWorkflow,
    commitSha: provenance.commitSha,
    registry,
  });
}

/**
 * Formats trust information for display.
 */
export function formatTrustInfo(trust: PluginTrustInfo): string {
  const lines: string[] = [];

  lines.push(`Trust Level: ${formatTrustLevel(trust.level)}`);
  lines.push(`Reason: ${trust.reason}`);

  if (trust.hasProvenance) {
    lines.push("Provenance: Verified");
    if (trust.sourceRepository) {
      lines.push(`  Source: ${trust.sourceRepository}`);
    }
    if (trust.commitSha) {
      lines.push(`  Commit: ${trust.commitSha}`);
    }
    if (trust.buildWorkflow) {
      lines.push(`  Workflow: ${trust.buildWorkflow}`);
    }
  } else {
    lines.push("Provenance: Not available");
  }

  if (trust.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of trust.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  return lines.join("\n");
}

/**
 * Formats a trust level as a human-readable string with indicator.
 */
export function formatTrustLevel(level: PluginTrustLevel): string {
  switch (level) {
    case "official":
      return "Official (Trusted)";
    case "verified":
      return "Verified (Provenance)";
    case "community":
      return "Community (Unverified)";
    case "private":
      return "Private Registry";
    case "unknown":
      return "Unknown";
    default:
      return level;
  }
}

/**
 * Gets a trust level badge/icon for display.
 */
export function getTrustBadge(level: PluginTrustLevel): string {
  switch (level) {
    case "official":
      return "✓ Official";
    case "verified":
      return "✓ Verified";
    case "community":
      return "⚠ Community";
    case "private":
      return "◉ Private";
    case "unknown":
      return "? Unknown";
    default:
      return level;
  }
}

// Re-export types and functions from plugin-types for convenience
export {
  type PluginTrustInfo,
  type PluginTrustLevel,
  determinePluginTrustBasic,
  determinePluginTrust,
  isOfficialPlugin,
  isPrivateRegistry,
  OFFICIAL_PLUGIN_SCOPES,
} from "./plugin-types";
