/**
 * Basic trust helpers that are safe to run in build-time environments.
 */

/**
 * Trust levels for plugins based on their source and verification status.
 *
 * The trust hierarchy (from most to least trusted):
 * 1. `official` - From @skaff/* or @timonteutelink/* scopes, maintained by Skaff team
 * 2. `verified` - Has npm provenance attestation linking to source repository
 * 3. `community` - Standard npm package without provenance
 * 4. `private` - From a private registry (user's responsibility)
 * 5. `unknown` - Trust level could not be determined
 */
export type PluginTrustLevel =
  | "official"
  | "verified"
  | "community"
  | "private"
  | "unknown";

/**
 * Official Skaff plugin scopes that are fully trusted.
 */
export const OFFICIAL_PLUGIN_SCOPES = ["@skaff", "@timonteutelink"] as const;

/**
 * Determines if a package name is from an official Skaff scope.
 */
export function isOfficialPlugin(packageName: string): boolean {
  return OFFICIAL_PLUGIN_SCOPES.some((scope) =>
    packageName.startsWith(`${scope}/`),
  );
}

/**
 * Determines a trust level using only build-time safe checks.
 *
 * This avoids network or registry lookups, making it safe for web build steps.
 */
export function determinePluginTrustBasic(
  packageName: string,
): PluginTrustLevel {
  return isOfficialPlugin(packageName) ? "official" : "community";
}
