import {
  checkVersionSatisfies,
  checkSinglePluginCompatibility,
  checkTemplatePluginCompatibility,
  formatCompatibilitySummary,
  type InstalledPluginInfo,
} from "../src/core/plugins/plugin-compatibility";
import { parsePackageSpec } from "../src/core/plugins/package-spec";

describe("plugin-compatibility", () => {
  describe("parsePackageSpec", () => {
    it("should handle simple package names", () => {
      expect(parsePackageSpec("my-plugin")).toEqual({ name: "my-plugin" });
    });

    it("should handle scoped packages", () => {
      expect(parsePackageSpec("@skaff/plugin-foo")).toEqual({
        name: "@skaff/plugin-foo",
      });
    });

    it("should remove version suffix from simple packages", () => {
      expect(parsePackageSpec("my-plugin@1.0.0")).toEqual({
        name: "my-plugin",
        version: "1.0.0",
      });
    });

    it("should remove version suffix from scoped packages", () => {
      expect(parsePackageSpec("@skaff/plugin-foo@1.2.3")).toEqual({
        name: "@skaff/plugin-foo",
        version: "1.2.3",
      });
    });

    it("should handle complex version suffixes", () => {
      expect(parsePackageSpec("@org/my-plugin@^2.0.0")).toEqual({
        name: "@org/my-plugin",
        version: "^2.0.0",
      });
    });
  });

  describe("checkVersionSatisfies", () => {
    it("should return true for exact version match", () => {
      const result = checkVersionSatisfies("1.0.0", "1.0.0");
      expect(result.satisfies).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should handle caret ranges", () => {
      expect(checkVersionSatisfies("1.2.3", "^1.0.0").satisfies).toBe(true);
      expect(checkVersionSatisfies("2.0.0", "^1.0.0").satisfies).toBe(false);
      expect(checkVersionSatisfies("1.0.0", "^1.0.0").satisfies).toBe(true);
    });

    it("should handle tilde ranges", () => {
      expect(checkVersionSatisfies("1.0.5", "~1.0.0").satisfies).toBe(true);
      expect(checkVersionSatisfies("1.1.0", "~1.0.0").satisfies).toBe(false);
    });

    it("should handle >= ranges", () => {
      expect(checkVersionSatisfies("2.0.0", ">=1.0.0").satisfies).toBe(true);
      expect(checkVersionSatisfies("0.9.0", ">=1.0.0").satisfies).toBe(false);
    });

    it("should handle complex ranges", () => {
      expect(checkVersionSatisfies("1.5.0", ">=1.0.0 <2.0.0").satisfies).toBe(
        true,
      );
      expect(checkVersionSatisfies("2.0.0", ">=1.0.0 <2.0.0").satisfies).toBe(
        false,
      );
    });

    it("should handle x-range", () => {
      expect(checkVersionSatisfies("1.5.0", "1.x").satisfies).toBe(true);
      expect(checkVersionSatisfies("2.0.0", "1.x").satisfies).toBe(false);
    });

    it("should return error for invalid installed version", () => {
      const result = checkVersionSatisfies("not-a-version", "^1.0.0");
      expect(result.satisfies).toBe(false);
      expect(result.error).toContain("Invalid installed version");
    });

    it("should return error for invalid version constraint", () => {
      const result = checkVersionSatisfies("1.0.0", "not-a-range");
      expect(result.satisfies).toBe(false);
      expect(result.error).toContain("Invalid version constraint");
    });
  });

  describe("checkSinglePluginCompatibility", () => {
    const createInstalledPluginsMap = (
      plugins: InstalledPluginInfo[],
    ): Map<string, InstalledPluginInfo> => {
      const map = new Map();
      for (const plugin of plugins) {
        map.set(plugin.name, plugin);
        if (plugin.packageName) {
          map.set(plugin.packageName, plugin);
        }
      }
      return map;
    };

    it("should return compatible when plugin is installed without version constraint", () => {
      const installed = createInstalledPluginsMap([
        { name: "@skaff/plugin-foo", version: "1.0.0" },
      ]);

      const result = checkSinglePluginCompatibility(
        { module: "@skaff/plugin-foo" },
        installed,
      );

      expect(result.compatible).toBe(true);
      expect(result.installedVersion).toBe("1.0.0");
    });

    it("should return compatible when version constraint is satisfied", () => {
      const installed = createInstalledPluginsMap([
        { name: "@skaff/plugin-foo", version: "1.5.0" },
      ]);

      const result = checkSinglePluginCompatibility(
        { module: "@skaff/plugin-foo", version: "^1.0.0" },
        installed,
      );

      expect(result.compatible).toBe(true);
      expect(result.requiredVersion).toBe("^1.0.0");
      expect(result.installedVersion).toBe("1.5.0");
    });

    it("should return not_installed when plugin is missing", () => {
      const installed = createInstalledPluginsMap([]);

      const result = checkSinglePluginCompatibility(
        { module: "@skaff/plugin-foo" },
        installed,
      );

      expect(result.compatible).toBe(false);
      expect(result.reason).toBe("not_installed");
    });

    it("should return version_mismatch when version constraint is not satisfied", () => {
      const installed = createInstalledPluginsMap([
        { name: "@skaff/plugin-foo", version: "1.0.0" },
      ]);

      const result = checkSinglePluginCompatibility(
        { module: "@skaff/plugin-foo", version: "^2.0.0" },
        installed,
      );

      expect(result.compatible).toBe(false);
      expect(result.reason).toBe("version_mismatch");
      expect(result.installedVersion).toBe("1.0.0");
      expect(result.requiredVersion).toBe("^2.0.0");
    });

    it("should find plugin by packageName", () => {
      const installed = createInstalledPluginsMap([
        {
          name: "plugin-foo",
          version: "1.0.0",
          packageName: "@skaff/plugin-foo",
        },
      ]);

      const result = checkSinglePluginCompatibility(
        { module: "@skaff/plugin-foo" },
        installed,
      );

      expect(result.compatible).toBe(true);
    });
  });

  describe("checkTemplatePluginCompatibility", () => {
    const createInstalledPluginsMap = (
      plugins: InstalledPluginInfo[],
    ): Map<string, InstalledPluginInfo> => {
      const map = new Map();
      for (const plugin of plugins) {
        map.set(plugin.name, plugin);
        if (plugin.packageName) {
          map.set(plugin.packageName, plugin);
        }
      }
      return map;
    };

    it("should return allCompatible true when no plugins required", () => {
      const result = checkTemplatePluginCompatibility(
        [],
        createInstalledPluginsMap([]),
      );

      expect(result.allCompatible).toBe(true);
      expect(result.plugins).toHaveLength(0);
    });

    it("should return allCompatible true when all plugins are compatible", () => {
      const installed = createInstalledPluginsMap([
        { name: "@skaff/plugin-a", version: "1.0.0" },
        { name: "@skaff/plugin-b", version: "2.5.0" },
      ]);

      const result = checkTemplatePluginCompatibility(
        [
          { module: "@skaff/plugin-a", version: "^1.0.0" },
          { module: "@skaff/plugin-b", version: ">=2.0.0" },
        ],
        installed,
      );

      expect(result.allCompatible).toBe(true);
      expect(result.compatible).toHaveLength(2);
      expect(result.missing).toHaveLength(0);
      expect(result.versionMismatches).toHaveLength(0);
    });

    it("should identify missing plugins", () => {
      const installed = createInstalledPluginsMap([
        { name: "@skaff/plugin-a", version: "1.0.0" },
      ]);

      const result = checkTemplatePluginCompatibility(
        [{ module: "@skaff/plugin-a" }, { module: "@skaff/plugin-b" }],
        installed,
      );

      expect(result.allCompatible).toBe(false);
      expect(result.missing).toHaveLength(1);
      expect(result.missing[0].module).toBe("@skaff/plugin-b");
    });

    it("should identify version mismatches", () => {
      const installed = createInstalledPluginsMap([
        { name: "@skaff/plugin-a", version: "1.0.0" },
        { name: "@skaff/plugin-b", version: "1.0.0" },
      ]);

      const result = checkTemplatePluginCompatibility(
        [
          { module: "@skaff/plugin-a", version: "^1.0.0" },
          { module: "@skaff/plugin-b", version: "^2.0.0" },
        ],
        installed,
      );

      expect(result.allCompatible).toBe(false);
      expect(result.compatible).toHaveLength(1);
      expect(result.versionMismatches).toHaveLength(1);
      expect(result.versionMismatches[0].module).toBe("@skaff/plugin-b");
    });
  });

  describe("formatCompatibilitySummary", () => {
    it("should format empty plugin list", () => {
      const summary = formatCompatibilitySummary({
        allCompatible: true,
        plugins: [],
        missing: [],
        versionMismatches: [],
        compatible: [],
      });

      expect(summary).toBe("No plugins required");
    });

    it("should format all compatible", () => {
      const summary = formatCompatibilitySummary({
        allCompatible: true,
        plugins: [
          { module: "a", compatible: true },
          { module: "b", compatible: true },
        ],
        missing: [],
        versionMismatches: [],
        compatible: [
          { module: "a", compatible: true },
          { module: "b", compatible: true },
        ],
      });

      expect(summary).toBe("All 2 required plugin(s) are compatible");
    });

    it("should format missing plugins", () => {
      const summary = formatCompatibilitySummary({
        allCompatible: false,
        plugins: [
          {
            module: "@skaff/plugin-foo",
            compatible: false,
            reason: "not_installed",
          },
        ],
        missing: [
          {
            module: "@skaff/plugin-foo",
            compatible: false,
            reason: "not_installed",
          },
        ],
        versionMismatches: [],
        compatible: [],
      });

      expect(summary).toContain("Missing plugins (1):");
      expect(summary).toContain("@skaff/plugin-foo");
    });

    it("should format version mismatches", () => {
      const summary = formatCompatibilitySummary({
        allCompatible: false,
        plugins: [
          {
            module: "@skaff/plugin-foo",
            compatible: false,
            reason: "version_mismatch",
            installedVersion: "1.0.0",
            requiredVersion: "^2.0.0",
          },
        ],
        missing: [],
        versionMismatches: [
          {
            module: "@skaff/plugin-foo",
            compatible: false,
            reason: "version_mismatch",
            installedVersion: "1.0.0",
            requiredVersion: "^2.0.0",
          },
        ],
        compatible: [],
      });

      expect(summary).toContain("Version mismatches (1):");
      expect(summary).toContain("installed v1.0.0");
      expect(summary).toContain("requires ^2.0.0");
    });
  });
});
