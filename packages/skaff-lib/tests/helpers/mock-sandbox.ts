/**
 * Mock Sandbox Service for Testing
 *
 * This module provides a mock implementation of the HardenedSandboxService
 * that does NOT import SES. It's suitable for unit tests that need to verify
 * sandbox integration without the full SES lockdown.
 *
 * For actual sandbox security testing, use integration tests with the real
 * HardenedSandboxService.
 */

import { jest } from "@jest/globals";
import { getSkaffContainer } from "../../src/di/container";
import { HardenedSandboxServiceToken } from "../../src/di/tokens";

/**
 * Options for the mock sandbox evaluation.
 * Matches HardenedSandboxOptions from the real sandbox.
 */
export interface MockSandboxOptions {
  code: string;
  allowedModules?: Record<string, unknown>;
  filename?: string;
  timeoutMs?: number;
}

/**
 * A mock implementation of HardenedSandboxService for testing.
 *
 * This mock:
 * - Does NOT import SES (no lockdown)
 * - Executes functions directly without isolation
 * - Can be configured to throw errors for testing error handling
 * - Tracks calls for verification
 */
export class MockHardenedSandboxService {
  public evaluateCommonJsCalls: MockSandboxOptions[] = [];
  public invokeFunctionCalls: Array<{ fn: Function; input: unknown }> = [];
  public invokeFunctionWithArgsCalls: Array<{
    fn: Function;
    args: unknown[];
  }> = [];

  private _shouldThrow = false;
  private _throwError: Error | null = null;
  private _mockEvaluateResult: unknown = null;

  /**
   * Configure the mock to throw an error on next call.
   */
  public throwOnNextCall(error: Error): void {
    this._shouldThrow = true;
    this._throwError = error;
  }

  /**
   * Configure a mock result for evaluateCommonJs.
   */
  public mockEvaluateResult(result: unknown): void {
    this._mockEvaluateResult = result;
  }

  /**
   * Reset all mock state.
   */
  public reset(): void {
    this.evaluateCommonJsCalls = [];
    this.invokeFunctionCalls = [];
    this.invokeFunctionWithArgsCalls = [];
    this._shouldThrow = false;
    this._throwError = null;
    this._mockEvaluateResult = null;
  }

  /**
   * Mock implementation of evaluateCommonJs.
   * Simply returns the mocked result or executes the code unsafely.
   */
  public evaluateCommonJs<TExports = Record<string, unknown>>(
    options: MockSandboxOptions,
  ): TExports {
    this.evaluateCommonJsCalls.push(options);

    if (this._shouldThrow && this._throwError) {
      this._shouldThrow = false;
      throw this._throwError;
    }

    if (this._mockEvaluateResult !== null) {
      return this._mockEvaluateResult as TExports;
    }

    // For tests that don't set a mock result, execute code unsafely
    // This is NOT secure but allows existing tests to work
    const { code, allowedModules = {} } = options;

    const mockRequire = (specifier: string): unknown => {
      if (specifier in allowedModules) {
        return allowedModules[specifier];
      }
      const root = specifier.split("/")[0];
      if (root && root in allowedModules) {
        return allowedModules[root];
      }
      throw new Error(`Blocked import in mock sandbox: ${specifier}`);
    };

    const moduleExports: Record<string, unknown> = {};
    const module = { exports: moduleExports };

    // Create a simple function wrapper and execute
    try {
      const wrapper = new Function(
        "exports",
        "require",
        "module",
        "__filename",
        "__dirname",
        code,
      );
      wrapper(
        moduleExports,
        mockRequire,
        module,
        options.filename || "mock.js",
        "",
      );
      return module.exports as TExports;
    } catch (error) {
      throw new Error(
        `Mock sandbox evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Mock implementation of invokeFunction.
   * Simply calls the function directly without hardening.
   */
  public invokeFunction<TInput, TOutput>(
    fn: (input: TInput) => TOutput,
    input: TInput,
  ): TOutput {
    this.invokeFunctionCalls.push({ fn, input });

    if (this._shouldThrow && this._throwError) {
      this._shouldThrow = false;
      throw this._throwError;
    }

    return fn(input);
  }

  /**
   * Mock implementation of invokeFunctionWithArgs.
   * Simply calls the function directly without hardening.
   */
  public invokeFunctionWithArgs<TArgs extends unknown[], TOutput>(
    fn: (...args: TArgs) => TOutput,
    ...args: TArgs
  ): TOutput {
    this.invokeFunctionWithArgsCalls.push({ fn, args });

    if (this._shouldThrow && this._throwError) {
      this._shouldThrow = false;
      throw this._throwError;
    }

    return fn(...args);
  }
}

/**
 * Creates a mock sandbox service and registers it in the DI container.
 *
 * @returns The mock sandbox instance and a cleanup function
 */
export function setupMockSandbox(): {
  mockSandbox: MockHardenedSandboxService;
  cleanup: () => void;
} {
  const mockSandbox = new MockHardenedSandboxService();

  const container = getSkaffContainer();
  container.register(HardenedSandboxServiceToken, {
    useValue: mockSandbox as unknown,
  });

  return {
    mockSandbox,
    cleanup: () => {
      mockSandbox.reset();
    },
  };
}

/**
 * Jest mock factory for HardenedSandboxService.
 *
 * Usage:
 * ```ts
 * jest.mock("../../src/core/infra/hardened-sandbox", () => ({
 *   ...createMockHardenedSandboxModule(),
 * }));
 * ```
 */
export function createMockHardenedSandboxModule() {
  const mockSandbox = new MockHardenedSandboxService();

  return {
    HardenedSandboxService: jest.fn(() => mockSandbox),
    resolveHardenedSandbox: jest.fn(() => mockSandbox),
    initializeHardenedEnvironment: jest.fn(),
    isHardenedEnvironmentInitialized: jest.fn(() => true),
    ensureHardenedEnvironment: jest.fn(),
    __mockSandbox: mockSandbox,
  };
}
