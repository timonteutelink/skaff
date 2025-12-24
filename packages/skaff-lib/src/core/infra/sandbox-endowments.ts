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
import * as handlebars from "handlebars";
import * as templateTypesLib from "@timonteutelink/template-types-lib";

import {
  ensureHardenedEnvironment,
  isHardenedEnvironmentInitialized,
  isHardenedEnvironmentTestMode,
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
  if (
    typeof harden === "function" &&
    !(harden as { __isPolyfill?: boolean }).__isPolyfill &&
    !isHardenedEnvironmentTestMode()
  ) {
    return harden(obj);
  }

  // Fallback for test environments: deep freeze
  if (depth > MAX_HARDEN_DEPTH) {
    return obj;
  }

  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (obj instanceof RegExp) {
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
 * - handlebars: Template rendering (pure, no I/O when used correctly)
 * - template-types-lib: Skaff type definitions (pure, no I/O)
 */
export interface SandboxLibraries {
  /** YAML parsing and serialization */
  yaml: typeof yaml;
  /** Zod schema validation */
  zod: typeof zod;
  /** Handlebars templating (for helpers) */
  handlebars: typeof handlebars;
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
  "handlebars",
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
    handlebars,
    "@timonteutelink/template-types-lib": templateTypesLib,
  };

  if (isHardenedEnvironmentTestMode()) {
    hardenedModulesCache = Object.freeze(modules);
    return hardenedModulesCache;
  }

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

/**
 * React stub for plugin sandboxing.
 *
 * Plugins that need React for web UI components receive this stub during
 * sandboxed evaluation. The stub provides minimal type-compatible exports
 * that allow the code to load without errors, but actual rendering happens
 * in the trusted web environment.
 *
 * SECURITY: All returned values are frozen/immutable to prevent:
 * - State leakage via mutable refs
 * - Prototype pollution via React internals
 * - Sandbox escapes via hook manipulation
 */
export const SANDBOX_REACT_STUB = Object.freeze({
  // Return null (frozen primitive) instead of creating elements
  createElement: Object.freeze(() => null),

  // Use a frozen symbol
  Fragment: Object.freeze(Symbol.for("react.fragment")),

  // Return frozen tuple with no-op setter
  useState: Object.freeze(() => Object.freeze([null, Object.freeze(() => {})])),

  // No-op effect
  useEffect: Object.freeze(() => {}),

  // Return the callback as-is (it's already from sandboxed code)
  useCallback: Object.freeze((fn: unknown) => fn),

  // Execute and return result (no memoization in stub)
  useMemo: Object.freeze((fn: () => unknown) =>
    typeof fn === "function" ? fn() : null,
  ),

  // Return frozen ref object
  useRef: Object.freeze(() => Object.freeze({ current: null })),

  // Additional commonly used hooks as no-ops
  useContext: Object.freeze(() => null),
  useReducer: Object.freeze(() =>
    Object.freeze([null, Object.freeze(() => {})]),
  ),
  useLayoutEffect: Object.freeze(() => {}),
  useImperativeHandle: Object.freeze(() => {}),
  useDebugValue: Object.freeze(() => {}),
  useDeferredValue: Object.freeze((value: unknown) => value),
  useTransition: Object.freeze(() =>
    Object.freeze([false, Object.freeze(() => {})]),
  ),
  useId: Object.freeze(() => "sandbox-id"),
  useSyncExternalStore: Object.freeze(() => null),
  useInsertionEffect: Object.freeze(() => {}),
});

/**
 * Gets the plugin-specific sandbox libraries.
 *
 * Plugins have access to the same libraries as templates, plus a React stub
 * for web plugin development.
 *
 * SECURITY: The React stub is completely inert and cannot:
 * - Access the DOM
 * - Make network requests
 * - Access browser APIs
 * - Escape the sandbox
 *
 * @returns A frozen record of module name to hardened exports
 */
export function getPluginSandboxLibraries(): Readonly<Record<string, unknown>> {
  ensureHardenedEnvironment();

  const baseLibs = getSandboxLibraries();

  // Create a new frozen object with React stub
  return Object.freeze({
    ...baseLibs,
    react: SANDBOX_REACT_STUB,
  });
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
