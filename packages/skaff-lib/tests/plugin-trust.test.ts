import {
  checkNpmProvenance,
  formatTrustInfo,
  formatTrustLevel,
  getPluginTrustInfo,
  getTrustBadge,
  type ProvenanceResult,
} from "../src/core/plugins/plugin-trust";

import {
  determinePluginTrust,
  isOfficialPlugin,
  isPrivateRegistry,
  OFFICIAL_PLUGIN_SCOPES,
  type PluginTrustInfo,
  type PluginTrustLevel,
} from "../src/core/plugins/plugin-types";

describe("plugin-trust", () => {
  describe("OFFICIAL_PLUGIN_SCOPES", () => {
    it("should include @skaff scope", () => {
      expect(OFFICIAL_PLUGIN_SCOPES).toContain("@skaff");
    });

    it("should include @timonteutelink scope", () => {
      expect(OFFICIAL_PLUGIN_SCOPES).toContain("@timonteutelink");
    });
  });

  describe("isOfficialPlugin", () => {
    it("should return true for @skaff scoped packages", () => {
      expect(isOfficialPlugin("@skaff/plugin-greeter")).toBe(true);
      expect(isOfficialPlugin("@skaff/plugin-docker")).toBe(true);
      expect(isOfficialPlugin("@skaff/anything")).toBe(true);
    });

    it("should return true for @timonteutelink scoped packages", () => {
      expect(isOfficialPlugin("@timonteutelink/skaff-lib")).toBe(true);
      expect(isOfficialPlugin("@timonteutelink/plugin-foo")).toBe(true);
    });

    it("should return false for other scoped packages", () => {
      expect(isOfficialPlugin("@myorg/my-plugin")).toBe(false);
      expect(isOfficialPlugin("@npm/package")).toBe(false);
      expect(isOfficialPlugin("@scope/skaff-plugin")).toBe(false);
    });

    it("should return false for unscoped packages", () => {
      expect(isOfficialPlugin("skaff-plugin")).toBe(false);
      expect(isOfficialPlugin("my-plugin")).toBe(false);
      expect(isOfficialPlugin("lodash")).toBe(false);
    });

    it("should return false for packages starting with scope name but not scoped", () => {
      expect(isOfficialPlugin("skaff-plugin-foo")).toBe(false);
      expect(isOfficialPlugin("timonteutelink-plugin")).toBe(false);
    });
  });

  describe("isPrivateRegistry", () => {
    it("should return false for undefined registry", () => {
      expect(isPrivateRegistry(undefined)).toBe(false);
    });

    it("should return false for public npm registry", () => {
      expect(isPrivateRegistry("https://registry.npmjs.org")).toBe(false);
      expect(isPrivateRegistry("https://registry.npmjs.org/")).toBe(false);
    });

    it("should return false for yarn registry", () => {
      expect(isPrivateRegistry("https://registry.yarnpkg.com")).toBe(false);
    });

    it("should return false for npm mirror", () => {
      expect(isPrivateRegistry("https://registry.npmmirror.com")).toBe(false);
    });

    it("should return true for private registries", () => {
      expect(isPrivateRegistry("https://npm.mycompany.com")).toBe(true);
      expect(isPrivateRegistry("https://verdaccio.internal.local")).toBe(true);
      expect(isPrivateRegistry("https://artifactory.corp.com/npm")).toBe(true);
    });

    it("should return true for local registries", () => {
      expect(isPrivateRegistry("http://localhost:4873")).toBe(true);
      expect(isPrivateRegistry("http://127.0.0.1:4873")).toBe(true);
    });
  });

  describe("determinePluginTrust", () => {
    describe("official plugins", () => {
      it("should return official trust level for @skaff scoped packages", () => {
        const result = determinePluginTrust("@skaff/plugin-greeter");

        expect(result.level).toBe("official");
        expect(result.reason).toContain("Official");
        expect(result.warnings).toHaveLength(0);
      });

      it("should return official trust level for @timonteutelink scoped packages", () => {
        const result = determinePluginTrust("@timonteutelink/plugin-foo");

        expect(result.level).toBe("official");
        expect(result.warnings).toHaveLength(0);
      });

      it("should include provenance info if available", () => {
        const result = determinePluginTrust("@skaff/plugin-greeter", {
          hasProvenance: true,
          sourceRepository: "https://github.com/skaff/plugins",
          commitSha: "abc123",
        });

        expect(result.level).toBe("official");
        expect(result.hasProvenance).toBe(true);
        expect(result.sourceRepository).toBe(
          "https://github.com/skaff/plugins",
        );
        expect(result.commitSha).toBe("abc123");
      });
    });

    describe("private registry plugins", () => {
      it("should return private trust level for private registry packages", () => {
        const result = determinePluginTrust("@myorg/my-plugin", {
          registry: "https://npm.mycompany.com",
        });

        expect(result.level).toBe("private");
        expect(result.reason).toContain("private");
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings[0]).toContain("private registry");
      });

      it("should still mark as private even with provenance", () => {
        const result = determinePluginTrust("@myorg/my-plugin", {
          registry: "https://npm.internal.com",
          hasProvenance: true,
          sourceRepository: "https://github.internal.com/repo",
        });

        expect(result.level).toBe("private");
      });
    });

    describe("verified plugins", () => {
      it("should return verified trust level for packages with provenance", () => {
        const result = determinePluginTrust("@community/skaff-plugin", {
          hasProvenance: true,
          sourceRepository: "https://github.com/community/skaff-plugin",
        });

        expect(result.level).toBe("verified");
        expect(result.hasProvenance).toBe(true);
        expect(result.sourceRepository).toBe(
          "https://github.com/community/skaff-plugin",
        );
        expect(result.reason).toContain("provenance");
        expect(result.warnings).toHaveLength(0);
      });

      it("should include build workflow info if available", () => {
        const result = determinePluginTrust("some-plugin", {
          hasProvenance: true,
          sourceRepository: "https://github.com/user/plugin",
          buildWorkflow: ".github/workflows/release.yml",
          commitSha: "def456",
        });

        expect(result.level).toBe("verified");
        expect(result.buildWorkflow).toBe(".github/workflows/release.yml");
        expect(result.commitSha).toBe("def456");
      });

      it("should require sourceRepository for verified status", () => {
        const result = determinePluginTrust("some-plugin", {
          hasProvenance: true,
          // No sourceRepository
        });

        expect(result.level).toBe("community");
      });
    });

    describe("community plugins", () => {
      it("should return community trust level for packages without provenance", () => {
        const result = determinePluginTrust("some-community-plugin");

        expect(result.level).toBe("community");
        expect(result.hasProvenance).toBe(false);
        expect(result.warnings.length).toBeGreaterThan(0);
      });

      it("should include multiple warnings for unverified plugins", () => {
        const result = determinePluginTrust("random-plugin");

        expect(result.warnings).toContain(
          "This plugin does not have npm provenance attestation.",
        );
        expect(result.warnings).toContain(
          "The code cannot be verified against a specific source repository.",
        );
        expect(result.warnings).toContain(
          "Review the plugin source code before trusting it with your projects.",
        );
      });

      it("should return community when hasProvenance is explicitly false", () => {
        const result = determinePluginTrust("another-plugin", {
          hasProvenance: false,
        });

        expect(result.level).toBe("community");
      });
    });
  });

  describe("formatTrustLevel", () => {
    it("should format official level", () => {
      expect(formatTrustLevel("official")).toBe("Official (Trusted)");
    });

    it("should format verified level", () => {
      expect(formatTrustLevel("verified")).toBe("Verified (Provenance)");
    });

    it("should format community level", () => {
      expect(formatTrustLevel("community")).toBe("Community (Unverified)");
    });

    it("should format private level", () => {
      expect(formatTrustLevel("private")).toBe("Private Registry");
    });

    it("should format unknown level", () => {
      expect(formatTrustLevel("unknown")).toBe("Unknown");
    });

    it("should return level as-is for unrecognized values", () => {
      expect(formatTrustLevel("custom" as PluginTrustLevel)).toBe("custom");
    });
  });

  describe("getTrustBadge", () => {
    it("should return badge for official", () => {
      expect(getTrustBadge("official")).toBe("\u2713 Official");
    });

    it("should return badge for verified", () => {
      expect(getTrustBadge("verified")).toBe("\u2713 Verified");
    });

    it("should return badge for community", () => {
      expect(getTrustBadge("community")).toBe("\u26A0 Community");
    });

    it("should return badge for private", () => {
      expect(getTrustBadge("private")).toBe("\u25C9 Private");
    });

    it("should return badge for unknown", () => {
      expect(getTrustBadge("unknown")).toBe("? Unknown");
    });
  });

  describe("formatTrustInfo", () => {
    it("should format official plugin trust info", () => {
      const trust: PluginTrustInfo = {
        level: "official",
        hasProvenance: false,
        reason: "Official Skaff plugin from a trusted scope",
        warnings: [],
      };

      const formatted = formatTrustInfo(trust);

      expect(formatted).toContain("Trust Level: Official (Trusted)");
      expect(formatted).toContain("Reason: Official Skaff plugin");
      expect(formatted).toContain("Provenance: Not available");
      expect(formatted).not.toContain("Warnings:");
    });

    it("should format verified plugin with full provenance", () => {
      const trust: PluginTrustInfo = {
        level: "verified",
        hasProvenance: true,
        sourceRepository: "https://github.com/org/repo",
        commitSha: "abc123def",
        buildWorkflow: ".github/workflows/publish.yml",
        reason: "Verified via npm provenance",
        warnings: [],
      };

      const formatted = formatTrustInfo(trust);

      expect(formatted).toContain("Trust Level: Verified (Provenance)");
      expect(formatted).toContain("Provenance: Verified");
      expect(formatted).toContain("Source: https://github.com/org/repo");
      expect(formatted).toContain("Commit: abc123def");
      expect(formatted).toContain("Workflow: .github/workflows/publish.yml");
    });

    it("should format community plugin with warnings", () => {
      const trust: PluginTrustInfo = {
        level: "community",
        hasProvenance: false,
        reason: "Community plugin without provenance verification",
        warnings: [
          "This plugin does not have npm provenance attestation.",
          "Review the source code before use.",
        ],
      };

      const formatted = formatTrustInfo(trust);

      expect(formatted).toContain("Trust Level: Community (Unverified)");
      expect(formatted).toContain("Provenance: Not available");
      expect(formatted).toContain("Warnings:");
      expect(formatted).toContain(
        "- This plugin does not have npm provenance attestation.",
      );
      expect(formatted).toContain("- Review the source code before use.");
    });

    it("should format private registry plugin", () => {
      const trust: PluginTrustInfo = {
        level: "private",
        hasProvenance: false,
        registry: "https://npm.internal.corp.com",
        reason: "Plugin from a private npm registry",
        warnings: [
          "This plugin is from a private registry. Ensure you trust the source.",
        ],
      };

      const formatted = formatTrustInfo(trust);

      expect(formatted).toContain("Trust Level: Private Registry");
      expect(formatted).toContain("Warnings:");
      expect(formatted).toContain("private registry");
    });
  });

  describe("checkNpmProvenance", () => {
    // These tests mock fetch to avoid real network calls
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("should return hasProvenance: false when package metadata fails", async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });

      const result = await checkNpmProvenance("@skaff/nonexistent");

      expect(result.hasProvenance).toBe(false);
      // When version is not specified and metadata fetch fails, we get an error about metadata
      expect(result.error).toContain("Could not fetch package metadata");
    });

    it("should return hasProvenance: false when attestations endpoint returns 404", async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes("/latest")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ version: "1.0.0" }),
          });
        }
        if (url.includes("/attestations/")) {
          return Promise.resolve({ ok: false, status: 404 });
        }
        return Promise.resolve({ ok: false });
      });

      const result = await checkNpmProvenance("some-package");

      expect(result.hasProvenance).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it("should extract version from package specifier", async () => {
      const fetchCalls: string[] = [];
      global.fetch = jest.fn().mockImplementation((url: string) => {
        fetchCalls.push(url);
        return Promise.resolve({ ok: false });
      });

      await checkNpmProvenance("@skaff/plugin@1.2.3");

      // Should not fetch /latest since version is specified
      expect(fetchCalls.some((u) => u.includes("/latest"))).toBe(false);
      // Should fetch attestations with the specified version
      expect(fetchCalls.some((u) => u.includes("@1.2.3"))).toBe(true);
    });

    it("should parse provenance attestation when available", async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes("/attestations/")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                attestations: [
                  {
                    predicateType: "https://slsa.dev/provenance/v1",
                    predicate: {
                      invocation: {
                        configSource: {
                          uri: "https://github.com/org/repo",
                          digest: { sha1: "abcdef123456" },
                          entryPoint: ".github/workflows/release.yml",
                        },
                      },
                    },
                  },
                ],
              }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const result = await checkNpmProvenance("pkg@1.0.0");

      expect(result.hasProvenance).toBe(true);
      expect(result.sourceRepository).toBe("https://github.com/org/repo");
      expect(result.commitSha).toBe("abcdef123456");
      expect(result.buildWorkflow).toBe(".github/workflows/release.yml");
    });

    it("should use materials array as fallback for source repo", async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes("/attestations/")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                attestations: [
                  {
                    predicateType: "https://slsa.dev/provenance/v0.2",
                    predicate: {
                      materials: [
                        {
                          uri: "git+https://github.com/user/package.git",
                          digest: { sha1: "123456" },
                        },
                      ],
                    },
                  },
                ],
              }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const result = await checkNpmProvenance("pkg@1.0.0");

      expect(result.hasProvenance).toBe(true);
      expect(result.sourceRepository).toBe(
        "git+https://github.com/user/package.git",
      );
    });
  });

  describe("getPluginTrustInfo", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("should return official trust for official plugins without provenance check", async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false });

      const result = await getPluginTrustInfo("@skaff/plugin-greeter", {
        skipProvenanceCheck: true,
      });

      expect(result.level).toBe("official");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should still check provenance for official plugins by default", async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false });

      const result = await getPluginTrustInfo("@skaff/plugin-greeter");

      expect(result.level).toBe("official");
      expect(global.fetch).toHaveBeenCalled();
    });

    it("should skip provenance check when option is set", async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false });

      const result = await getPluginTrustInfo("some-community-plugin", {
        skipProvenanceCheck: true,
      });

      expect(result.level).toBe("community");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should detect verified status from provenance", async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes("/attestations/")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                attestations: [
                  {
                    predicateType: "provenance",
                    predicate: {
                      invocation: {
                        configSource: {
                          uri: "https://github.com/org/plugin",
                        },
                      },
                    },
                  },
                ],
              }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const result = await getPluginTrustInfo("@org/plugin@1.0.0");

      expect(result.level).toBe("verified");
      expect(result.hasProvenance).toBe(true);
      expect(result.sourceRepository).toBe("https://github.com/org/plugin");
    });

    it("should use custom registry when provided", async () => {
      const customRegistry = "https://npm.mycompany.com";
      const fetchCalls: string[] = [];

      global.fetch = jest.fn().mockImplementation((url: string) => {
        fetchCalls.push(url);
        return Promise.resolve({ ok: false });
      });

      await getPluginTrustInfo("@internal/plugin@1.0.0", {
        registry: customRegistry,
      });

      expect(fetchCalls.some((url) => url.startsWith(customRegistry))).toBe(
        true,
      );
    });
  });
});
