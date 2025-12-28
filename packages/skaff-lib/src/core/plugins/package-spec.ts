export interface ParsedPackageSpec {
  name: string;
  version?: string;
}

/**
 * Parses a package specifier into name and optional version.
 *
 * @example
 * parsePackageSpec("@scope/plugin@1.0.0") // { name: "@scope/plugin", version: "1.0.0" }
 * parsePackageSpec("plugin@^2.0.0") // { name: "plugin", version: "^2.0.0" }
 */
export function parsePackageSpec(packageSpec: string): ParsedPackageSpec {
  if (packageSpec.startsWith("@")) {
    const parts = packageSpec.split("/");
    if (parts.length >= 2) {
      const scope = parts[0];
      const nameWithVersion = parts.slice(1).join("/");
      const atIndex = nameWithVersion.lastIndexOf("@");
      if (atIndex > 0) {
        return {
          name: `${scope}/${nameWithVersion.slice(0, atIndex)}`,
          version: nameWithVersion.slice(atIndex + 1),
        };
      }
      return { name: packageSpec };
    }
  } else {
    const atIndex = packageSpec.lastIndexOf("@");
    if (atIndex > 0) {
      return {
        name: packageSpec.slice(0, atIndex),
        version: packageSpec.slice(atIndex + 1),
      };
    }
  }

  return { name: packageSpec };
}
