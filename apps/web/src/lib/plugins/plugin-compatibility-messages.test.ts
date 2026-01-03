import { describe, expect, it } from "bun:test";
import type { PluginCompatibilityResult } from "./web-stage-loader";
import {
  buildCompatibilitySummary,
  buildWebInstallInstructions,
  formatGlobalConfigIssue,
  formatPluginMismatch,
  formatPluginRequirement,
  getCompatibilityBreakdown,
} from "./plugin-compatibility-messages";

describe("plugin compatibility messages", () => {
  it("summarizes templates without required plugins", () => {
    const result: PluginCompatibilityResult = {
      compatible: true,
      missing: [],
      available: [],
      hasTrustWarnings: false,
      untrustedPlugins: [],
    };

    expect(buildCompatibilitySummary(result)).toBe("No plugins required");
  });

  it("summarizes compatible templates with required plugins", () => {
    const result: PluginCompatibilityResult = {
      compatible: true,
      missing: [],
      available: [
        {
          name: "@skaff/plugin-foo",
          packageName: "@skaff/plugin-foo",
          version: "1.0.0",
          trustLevel: "official",
        },
      ],
      hasTrustWarnings: false,
      untrustedPlugins: [],
    };

    expect(buildCompatibilitySummary(result)).toBe(
      "All 1 required plugin(s) are compatible",
    );
  });

  it("formats missing and mismatched plugins with versions", () => {
    const result: PluginCompatibilityResult = {
      compatible: false,
      missing: [
        {
          module: "@skaff/plugin-foo",
          requiredVersion: "^1.2.0",
          reason: "not_installed",
        },
        {
          module: "@skaff/plugin-bar",
          requiredVersion: "^2.0.0",
          installedVersion: "1.5.0",
          reason: "version_mismatch",
        },
        {
          module: "@skaff/plugin-baz",
          reason: "invalid_global_config",
          message: "Invalid global config for plugin @skaff/plugin-baz",
        },
      ],
      available: [],
      hasTrustWarnings: false,
      untrustedPlugins: [],
    };

    const breakdown = getCompatibilityBreakdown(result);
    expect(breakdown.missing).toHaveLength(1);
    expect(breakdown.versionMismatches).toHaveLength(1);
    expect(breakdown.invalidGlobalConfig).toHaveLength(1);
    expect(formatPluginRequirement(breakdown.missing[0]!)).toBe(
      "@skaff/plugin-foo@^1.2.0",
    );
    expect(formatPluginMismatch(breakdown.versionMismatches[0]!)).toBe(
      "@skaff/plugin-bar: installed v1.5.0, requires ^2.0.0",
    );
    expect(formatGlobalConfigIssue(breakdown.invalidGlobalConfig[0]!)).toBe(
      "@skaff/plugin-baz: Invalid global config for plugin @skaff/plugin-baz",
    );
  });

  it("builds web install instructions for missing plugins", () => {
    const instructions = buildWebInstallInstructions([
      "@skaff/plugin-foo@^1.2.0",
      "@skaff/plugin-bar",
    ]);

    expect(instructions?.docker).toBe(
      'SKAFF_PLUGINS="@skaff/plugin-foo@^1.2.0 @skaff/plugin-bar"',
    );
    expect(instructions?.nix).toBe(
      'plugins = [ "@skaff/plugin-foo@^1.2.0" "@skaff/plugin-bar" ]',
    );
  });

  it("summarizes invalid global settings", () => {
    const result: PluginCompatibilityResult = {
      compatible: false,
      missing: [
        {
          module: "@skaff/plugin-baz",
          reason: "invalid_global_config",
          message: "Invalid global config for plugin @skaff/plugin-baz",
        },
      ],
      available: [],
      hasTrustWarnings: false,
      untrustedPlugins: [],
    };

    expect(buildCompatibilitySummary(result)).toBe(
      "Invalid global settings (1)",
    );
  });
});
