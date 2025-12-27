/**
 * Hardened JavaScript Sandbox using SES (Secure ECMAScript)
 *
 * This module provides a fully isolated execution environment for untrusted code
 * using the Endo SES library. It ensures:
 *
 * - **Determinism**: Same code + same inputs = same outputs (no Date.now, Math.random)
 * - **Isolation**: Code runs in a separate Compartment with no ambient authority
 * - **Prototype pollution immunity**: All intrinsics are frozen after lockdown
 * - **No side effects**: Code cannot access filesystem, network, or process
 * - **Defense in depth**: Multiple layers of protection against sandbox escapes
 *
 * @module
 */

import "ses";
import { getSkaffContainer } from "../../di/container";
import { HardenedSandboxServiceToken } from "../../di/tokens";

/**
 * Whether lockdown has been called. Lockdown can only be called once per process.
 */
let isLockedDown = false;

/**
 * Maximum allowed code size in bytes (1MB).
 * Prevents memory exhaustion attacks via large code strings.
 */
const MAX_CODE_SIZE_BYTES = 1024 * 1024;

/**
 * Maximum recursion depth for deep freezing objects.
 * Prevents stack overflow from deeply nested structures.
 */
const MAX_FREEZE_DEPTH = 100;

/**
 * Initializes the hardened JavaScript environment by calling lockdown().
 * This MUST be called before any untrusted code is evaluated.
 *
 * Lockdown:
 * - Freezes all JavaScript intrinsics (Object, Array, Function, etc.)
 * - Disables Date.now() and Math.random() for determinism
 * - Prevents prototype pollution attacks
 * - Can only be called ONCE per process
 *
 * Security settings are configured for MAXIMUM isolation:
 * - Error stacks are tamed to prevent information leakage
 * - Console is tamed to prevent covert channels
 * - All locale-based and RegExp-based attacks are blocked
 * - Node.js domains are disabled (security risk)
 *
 * @throws If called after untrusted code has already run without lockdown
 */
export function initializeHardenedEnvironment(): void {
  if (isLockedDown) {
    return;
  }

  lockdown({
    // SECURITY: Tame error stacks to prevent information leakage about host environment.
    // "safe" mode redacts sensitive paths and stack frames.
    // Use "unsafe" only for debugging in development.
    errorTaming: "safe",

    // SECURITY: Severe override taming prevents the "override mistake" attack
    // where attacker could override inherited properties.
    overrideTaming: "severe",

    // SECURITY: Tame console to prevent covert channels and information leakage.
    // Sandboxed code gets a virtualized console that cannot leak to host.
    consoleTaming: "safe",

    // SECURITY: Safe locale taming prevents locale-based covert channels
    // and ensures deterministic string operations.
    localeTaming: "safe",

    // SECURITY: Safe RegExp taming removes deprecated compile method
    // which could be used for certain attacks.
    regExpTaming: "safe",

    // SECURITY: Disable eval in compartments by default.
    // We use Compartment.evaluate() which is controlled.
    evalTaming: "safe-eval",

    // SECURITY: Verbose stack filtering helps debugging while keeping safety.
    // "concise" removes SES internals from stacks.
    stackFiltering: "concise",

    // SECURITY: Safe domain taming disables Node.js domains which are
    // a security risk (can capture uncaught exceptions from other contexts).
    domainTaming: "safe",
  });

  isLockedDown = true;
}

/**
 * Checks if the hardened environment has been initialized.
 */
export function isHardenedEnvironmentInitialized(): boolean {
  return isLockedDown;
}

/**
 * Deep freeze function for test environments.
 * Recursively freezes all properties of an object.
 */
function deepFreeze<T>(obj: T, seen = new WeakSet(), depth = 0): T {
  if (depth > MAX_FREEZE_DEPTH) {
    return obj; // Prevent infinite recursion on deeply nested structures
  }

  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  // Handle circular references
  if (seen.has(obj as object)) {
    return obj;
  }
  seen.add(obj as object);

  // Freeze all properties first
  const propNames = Object.getOwnPropertyNames(obj);
  for (const name of propNames) {
    const value = (obj as Record<string, unknown>)[name];
    if (value !== null && typeof value === "object") {
      deepFreeze(value, seen, depth + 1);
    }
  }

  return Object.freeze(obj);
}

/**
 * Marks the hardened environment as initialized WITHOUT calling lockdown.
 *
 * WARNING: This is ONLY for testing environments where SES lockdown conflicts
 * with test infrastructure (e.g., Jest's mocking system uses Node.js domains).
 *
 * In production, always use initializeHardenedEnvironment() instead.
 *
 * This provides a polyfill for `harden` that is a no-op to keep test
 * environments compatible with libraries that mutate built-ins (e.g. RegExp).
 */
export function markHardenedEnvironmentForTesting(): void {
  if (isLockedDown) {
    return;
  }

  // Provide a no-op harden fallback in test environments.
  if (typeof globalThis.harden !== "function") {
    (globalThis as unknown as { harden: <T>(value: T) => T }).harden = (
      value,
    ) => value;
  }

  isLockedDown = true;
}

/**
 * Ensures the hardened environment is initialized, throwing if not.
 * Call this before any sandbox operations.
 */
export function ensureHardenedEnvironment(): void {
  if (!isLockedDown) {
    throw new Error(
      "Hardened environment not initialized. Call initializeHardenedEnvironment() before using the sandbox.",
    );
  }
}

/**
 * Options for running code in the hardened sandbox.
 */
export interface HardenedSandboxOptions {
  /** The JavaScript code to execute (CommonJS format) */
  code: string;

  /** Map of module names to their exports that can be imported */
  allowedModules?: Record<string, unknown>;

  /** Filename for error stack traces */
  filename?: string;

  /**
   * Timeout in milliseconds.
   * NOTE: SES does not enforce timeouts. This is documented for future implementation
   * using worker threads or other mechanisms.
   */
  timeoutMs?: number;
}

/**
 * Options for invoking a sandboxed function.
 */
export interface InvokeFunctionOptions<TInput> {
  /** The function to invoke (must have been created in a sandbox) */
  fn: (input: TInput) => unknown;

  /** The input to pass to the function */
  input: TInput;
}

/**
 * Validates that a module specifier is safe (no path traversal, etc.)
 */
function isValidModuleSpecifier(specifier: string): boolean {
  // Block empty specifiers
  if (!specifier || specifier.trim() === "") {
    return false;
  }

  // Block path traversal attempts
  if (specifier.includes("..")) {
    return false;
  }

  // Block absolute paths
  if (specifier.startsWith("/") || /^[a-zA-Z]:/.test(specifier)) {
    return false;
  }

  // Block file:// and other URL protocols
  if (/^[a-z]+:\/\//i.test(specifier)) {
    return false;
  }

  return true;
}

/**
 * Minimal, sandboxed console that logs with a prefix.
 * All methods are no-ops in production to prevent covert channels.
 * The console can only be enabled explicitly for debugging.
 */
function createSandboxConsole(
  filename: string,
  enableLogging: boolean = false,
): Record<string, (...args: unknown[]) => void> {
  const prefix = `[sandbox:${filename}]`;

  // Create no-op functions for production
  const noop = () => {};

  // Create logging functions for debug mode
  const createLogger =
    (level: "log" | "info" | "warn" | "error" | "debug") =>
    (...args: unknown[]) => {
      if (enableLogging) {
        console[level](prefix, ...args);
      }
    };

  return Object.freeze({
    log: enableLogging ? createLogger("log") : noop,
    info: enableLogging ? createLogger("info") : noop,
    warn: enableLogging ? createLogger("warn") : noop,
    error: enableLogging ? createLogger("error") : noop,
    debug: enableLogging ? createLogger("debug") : noop,
    // Explicitly block dangerous console methods
    trace: noop,
    dir: noop,
    dirxml: noop,
    table: noop,
    count: noop,
    countReset: noop,
    time: noop,
    timeEnd: noop,
    timeLog: noop,
    group: noop,
    groupCollapsed: noop,
    groupEnd: noop,
    clear: noop,
    assert: noop,
    profile: noop,
    profileEnd: noop,
  });
}

/**
 * Creates minimal compartment globals.
 *
 * NOTE: SES Compartments already inherit frozen intrinsics including:
 * - undefined, NaN, Infinity
 * - isNaN, isFinite, parseFloat, parseInt
 * - encodeURI, decodeURI, encodeURIComponent, decodeURIComponent
 * - Object, Array, String, Number, Boolean, Symbol, etc.
 *
 * We only need to provide additional globals like console.
 * We intentionally DO NOT provide:
 * - TextEncoder/TextDecoder (could be used for binary manipulation)
 * - URL/URLSearchParams (could be used to construct malicious URLs)
 * - setTimeout/setInterval (timing attacks, infinite loops)
 * - fetch/XMLHttpRequest (network access)
 * - Buffer (binary manipulation, potential for exploits)
 * - process/require (Node.js access)
 * - eval/Function (code execution)
 */
function createCompartmentGlobals(
  filename: string,
  enableDebugLogging: boolean,
): Record<string, unknown> {
  return {
    // Only provide a sandboxed console - compartment already has standard globals
    console: createSandboxConsole(filename, enableDebugLogging),
  };
}

/**
 * Service for executing code in a fully isolated SES Compartment.
 *
 * The HardenedSandboxService provides a secure execution environment where:
 * - Code has no access to filesystem, network, or process
 * - All intrinsics are frozen to prevent prototype pollution
 * - Date.now() and Math.random() are disabled for determinism
 * - Only explicitly whitelisted modules can be imported
 * - All inputs and outputs are hardened (deeply frozen)
 * - Code size is limited to prevent memory exhaustion
 * - Console output is sandboxed to prevent information leakage
 *
 * @example
 * ```typescript
 * const sandbox = new HardenedSandboxService();
 * const result = sandbox.evaluateCommonJs<{ value: number }>({
 *   code: 'const yaml = require("yaml"); module.exports = { value: 42 };',
 *   allowedModules: { yaml: yamlModule },
 * });
 * ```
 */
export class HardenedSandboxService {
  /**
   * Enable debug logging in sandbox console.
   * Should only be true during development/debugging.
   */
  private readonly enableDebugLogging: boolean;

  constructor(options?: { enableDebugLogging?: boolean }) {
    this.enableDebugLogging = options?.enableDebugLogging ?? false;
  }

  /**
   * Evaluates CommonJS-style code in a fully isolated Compartment.
   *
   * The code is wrapped in a CommonJS-style IIFE and executed in a fresh
   * Compartment with only the explicitly allowed modules available.
   *
   * Security measures:
   * - Code size limit (1MB) to prevent memory exhaustion
   * - All modules are hardened before being provided
   * - All exports are hardened before being returned
   * - No ambient authority is available to the code
   *
   * @param options - Configuration for the sandbox execution
   * @returns The module.exports value from the evaluated code
   * @throws If the code throws an error or tries to access blocked resources
   */
  public evaluateCommonJs<TExports = Record<string, unknown>>(
    options: HardenedSandboxOptions,
  ): TExports {
    ensureHardenedEnvironment();

    const { code, allowedModules = {}, filename = "sandbox.js" } = options;

    // SECURITY: Enforce code size limit
    if (code.length > MAX_CODE_SIZE_BYTES) {
      throw new Error(
        `Sandbox code exceeds maximum size limit of ${MAX_CODE_SIZE_BYTES} bytes`,
      );
    }

    // SECURITY: Validate filename to prevent path traversal in stack traces
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

    // Create a sandboxed require function with strict validation
    const sandboxedRequire = this.createSandboxedRequire(allowedModules);

    // Build minimal compartment globals (only console, compartment already has standard globals)
    const compartmentGlobals = createCompartmentGlobals(
      safeFilename,
      this.enableDebugLogging,
    );

    // Create the isolated compartment
    const compartment = new Compartment({
      globals: compartmentGlobals,
      __options__: true,
    });

    // SECURITY: Freeze the compartment's globalThis to prevent tampering
    harden(compartment.globalThis);

    // Wrap code in CommonJS-style module wrapper
    // The wrapper is minimal and provides no ambient authority
    const wrappedCode = `
      (function(exports, require, module, __filename, __dirname) {
        "use strict";
        ${code}
        return module.exports;
      })
    `;

    // Evaluate the wrapper function
    let moduleFactory: (
      exports: Record<string, unknown>,
      require: (specifier: string) => unknown,
      module: { exports: Record<string, unknown> },
      __filename: string,
      __dirname: string,
    ) => Record<string, unknown>;

    try {
      moduleFactory = compartment.evaluate(wrappedCode);
    } catch (error) {
      throw new Error(
        `Sandbox evaluation failed for ${safeFilename}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Execute the module with minimal context
    const moduleExports: Record<string, unknown> = {};
    const module = { exports: moduleExports };

    try {
      const result = moduleFactory(
        moduleExports,
        sandboxedRequire,
        module,
        safeFilename,
        "", // Empty dirname - no path information
      );

      // SECURITY: Return hardened exports to prevent mutation after evaluation
      return harden(result ?? module.exports) as TExports;
    } catch (error) {
      throw new Error(
        `Sandbox execution failed for ${safeFilename}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Invokes a function that was created in a sandboxed context.
   *
   * This method ensures that:
   * - The input is hardened before being passed to the function
   * - The output is hardened before being returned
   * - The function executes with frozen intrinsics
   *
   * @param fn - The function to invoke (should be from sandboxed code)
   * @param input - The input to pass to the function
   * @returns The hardened result of the function call
   */
  public invokeFunction<TInput, TOutput>(
    fn: (input: TInput) => TOutput,
    input: TInput,
  ): TOutput {
    ensureHardenedEnvironment();

    // SECURITY: Validate that fn is actually a function
    if (typeof fn !== "function") {
      throw new Error("Sandbox invokeFunction called with non-function");
    }

    // Harden input to prevent the function from mutating it
    const hardenedInput = harden(input);

    try {
      const result = fn(hardenedInput);
      // Harden output to prevent caller from mutating shared state
      return harden(result) as TOutput;
    } catch (error) {
      throw new Error(
        `Sandboxed function execution failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Invokes a function with multiple arguments in a sandboxed context.
   *
   * @param fn - The function to invoke
   * @param args - The arguments to pass to the function
   * @returns The hardened result of the function call
   */
  public invokeFunctionWithArgs<TArgs extends unknown[], TOutput>(
    fn: (...args: TArgs) => TOutput,
    ...args: TArgs
  ): TOutput {
    ensureHardenedEnvironment();

    // SECURITY: Validate that fn is actually a function
    if (typeof fn !== "function") {
      throw new Error(
        "Sandbox invokeFunctionWithArgs called with non-function",
      );
    }

    // Harden each argument
    const hardenedArgs = args.map((arg) => harden(arg)) as TArgs;

    try {
      const result = fn(...hardenedArgs);
      return harden(result) as TOutput;
    } catch (error) {
      throw new Error(
        `Sandboxed function execution failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Creates a sandboxed require function that only allows whitelisted modules.
   *
   * Security measures:
   * - All module specifiers are validated
   * - Only exact matches are allowed (no subpath imports)
   * - All modules are hardened before being returned
   * - Clear error messages for blocked imports
   *
   * @param allowedModules - Map of module names to their exports
   * @returns A require function that throws for non-whitelisted imports
   */
  private createSandboxedRequire(
    allowedModules: Record<string, unknown>,
  ): (specifier: string) => unknown {
    // SECURITY: Harden all allowed modules to prevent mutation
    const hardenedModules: Record<string, unknown> = {};
    for (const [name, exports] of Object.entries(allowedModules)) {
      // Validate module name
      if (!isValidModuleSpecifier(name)) {
        throw new Error(`Invalid module name in allowedModules: "${name}"`);
      }
      hardenedModules[name] = harden(exports);
    }

    // Freeze the modules map itself
    Object.freeze(hardenedModules);

    return (specifier: string): unknown => {
      // SECURITY: Validate the specifier
      if (!isValidModuleSpecifier(specifier)) {
        throw new Error(`Invalid module specifier in sandbox: "${specifier}"`);
      }

      // SECURITY: Only allow exact matches to prevent path confusion attacks
      // Subpath imports like "yaml/parse" are NOT allowed - templates must use
      // the root module and access subpaths via property access.
      if (specifier in hardenedModules) {
        return hardenedModules[specifier];
      }

      // Provide helpful error message listing allowed modules
      const allowed = Object.keys(hardenedModules).join(", ");
      throw new Error(
        `Blocked import in sandbox: "${specifier}". Allowed modules: ${allowed || "none"}`,
      );
    };
  }
}

/**
 * Resolves the HardenedSandboxService from the DI container.
 *
 * @returns The singleton HardenedSandboxService instance
 */
export function resolveHardenedSandbox(): HardenedSandboxService {
  return getSkaffContainer().resolve(HardenedSandboxServiceToken);
}
