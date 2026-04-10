/**
 * Hardened Library Endowments for Sandboxed Code
 *
 * This module provides pre-hardened versions of allowed libraries that can be
 * safely imported from sandboxed code. All exports are frozen to prevent
 * modification by untrusted code.
 *
 * SECURITY CONSIDERATIONS:
 * - Only include libraries that are safe for untrusted code to use
 * - All libraries are deeply frozen (hardened) before being provided
 * - Libraries should not provide access to filesystem, network, or process
 * - Libraries should be pure/deterministic where possible
 *
 * @module
 */

import "ses";

import * as yaml from "yaml";
import * as zod from "zod";
import * as templateTypesLib from "@timonteutelink/template-types-lib";

import {
  ensureHardenedEnvironment,
  isHardenedEnvironmentInitialized,
} from "./hardened-sandbox";

/**
 * Maximum recursion depth for deep freezing.
 * Prevents stack overflow from deeply nested module structures.
 */
const MAX_HARDEN_DEPTH = 50;

/**
 * Hardens an object if the SES `harden` global is available.
 * Falls back to deep Object.freeze for test mode without full lockdown.
 *
 * SECURITY: This function recursively freezes all properties to prevent
 * sandboxed code from modifying shared library state.
 */
function hardenOrDeepFreeze<T>(obj: T, seen = new WeakSet(), depth = 0): T {
  // Use SES harden if available (preferred)
  if (typeof harden === "function") {
    return harden(obj);
  }

  // Fallback for test environments: deep freeze
  if (depth > MAX_HARDEN_DEPTH) {
    return obj;
  }

  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (seen.has(obj as object)) {
    return obj;
  }
  seen.add(obj as object);

  // Freeze all nested properties
  const propNames = Object.getOwnPropertyNames(obj);
  for (const name of propNames) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(obj, name);
      if (descriptor && "value" in descriptor) {
        const value = descriptor.value;
        if (value !== null && typeof value === "object") {
          hardenOrDeepFreeze(value, seen, depth + 1);
        }
      }
    } catch {
      // Some properties may not be accessible
    }
  }

  return Object.freeze(obj) as T;
}

/**
 * The set of libraries that can be imported from sandboxed template code.
 *
 * These are the only external dependencies that template configurations and
 * plugins are allowed to use. Each library is hardened (deeply frozen) to
 * prevent modification.
 *
 * ALLOWED LIBRARIES:
 * - yaml: YAML parsing/serialization (pure, no I/O)
 * - zod: Schema validation (pure, no I/O)
 * - template-types-lib: Skaff type definitions (pure, no I/O)
 */
export interface SandboxLibraries {
  /** YAML parsing and serialization */
  yaml: typeof yaml;
  /** Zod schema validation */
  zod: typeof zod;
  /** Skaff template types and utilities */
  "@timonteutelink/template-types-lib": typeof templateTypesLib;
}

/**
 * Module names that are allowed in sandboxed code.
 *
 * SECURITY: This is a strict allowlist. Any module not in this list
 * will be blocked with an error. Do not add modules that:
 * - Access the filesystem (fs, path operations that resolve)
 * - Access the network (http, fetch, websocket)
 * - Access the process (child_process, cluster, worker_threads)
 * - Access system resources (os, crypto with hardware random)
 */
export const ALLOWED_MODULE_NAMES = [
  "yaml",
  "zod",
  "@timonteutelink/template-types-lib",
] as const;

export type AllowedModuleName = (typeof ALLOWED_MODULE_NAMES)[number];

/**
 * Cached hardened modules. Populated lazily on first access.
 * The cache is frozen to prevent any modification.
 */
let hardenedModulesCache: Readonly<Record<string, unknown>> | null = null;

/**
 * Gets the hardened sandbox libraries.
 *
 * This function lazily hardens all allowed modules on first call.
 * The hardened modules are cached for subsequent calls.
 *
 * SECURITY: All modules are deeply frozen to prevent:
 * - Prototype pollution via module modification
 * - State leakage between sandbox invocations
 * - Sandbox escapes via mutable module properties
 *
 * @returns A frozen record of module name to hardened exports
 */
export function getSandboxLibraries(): Readonly<Record<string, unknown>> {
  ensureHardenedEnvironment();

  if (hardenedModulesCache) {
    return hardenedModulesCache;
  }

  // Build the modules map with only safe, pure libraries
  const modules: Record<string, unknown> = {
    yaml,
    zod,
    "@timonteutelink/template-types-lib": templateTypesLib,
  };

  // Harden each module deeply
  const hardenedModules: Record<string, unknown> = {};
  for (const [name, moduleExports] of Object.entries(modules)) {
    hardenedModules[name] = hardenOrDeepFreeze(moduleExports);
  }

  // Freeze the container itself
  hardenedModulesCache = Object.freeze(hardenedModules);
  return hardenedModulesCache;
}

/**
 * Gets a specific hardened module by name.
 *
 * @param name - The name of the module to retrieve
 * @returns The hardened module exports
 * @throws If the module name is not in the allowed list
 */
export function getSandboxLibrary<T = unknown>(name: AllowedModuleName): T {
  const libs = getSandboxLibraries();
  if (!(name in libs)) {
    throw new Error(`Module "${name}" is not available in the sandbox`);
  }
  return libs[name] as T;
}

const pluginSandboxLibraries = new Map<string, unknown>();
let pluginSandboxLibrariesCache: Readonly<Record<string, unknown>> | null = null;

/**
 * Register extra libraries for plugin sandbox execution.
 *
 * Use this to inject environment-specific stubs (such as UI libraries)
 * without coupling core sandbox code to those dependencies.
 *
 * @param libraries - A map of module name to hardened exports
 */
export function registerPluginSandboxLibraries(
  libraries: Record<string, unknown>,
): void {
  if (!libraries || typeof libraries !== "object") {
    return;
  }

  for (const [name, moduleExports] of Object.entries(libraries)) {
    pluginSandboxLibraries.set(name, moduleExports);
  }

  pluginSandboxLibrariesCache = null;
}

/**
 * Gets the plugin-specific sandbox libraries.
 *
 * Plugins have access to the same libraries as templates, plus any
 * environment-registered extensions.
 *
 * @returns A frozen record of module name to hardened exports
 */
export function getPluginSandboxLibraries(): Readonly<Record<string, unknown>> {
  ensureHardenedEnvironment();

  if (pluginSandboxLibrariesCache) {
    return pluginSandboxLibrariesCache;
  }

  const baseLibs = getSandboxLibraries();
  const extendedLibs: Record<string, unknown> = { ...baseLibs };

  for (const [name, moduleExports] of pluginSandboxLibraries.entries()) {
    extendedLibs[name] = hardenOrDeepFreeze(moduleExports);
  }

  pluginSandboxLibrariesCache = Object.freeze(extendedLibs);
  return pluginSandboxLibrariesCache;
}

/**
 * Validates that a module name is in the allowed list.
 *
 * @param name - The module name to validate
 * @returns true if the module is allowed, false otherwise
 */
export function isAllowedModule(name: string): name is AllowedModuleName {
  return ALLOWED_MODULE_NAMES.includes(name as AllowedModuleName);
}

/**
 * Gets the list of allowed module names for external use.
 *
 * @returns A frozen array of allowed module names
 */
export function getAllowedModuleNames(): readonly string[] {
  return ALLOWED_MODULE_NAMES;
}
