/**
 * Tests for HardenedSandboxService
 *
 * Note: These tests use a mock sandbox implementation that does NOT import SES.
 * This allows unit tests to run without the SES lockdown, which can conflict
 * with reflect-metadata and other libraries.
 *
 * For actual security testing of the sandbox, integration tests should be
 * created that run in an isolated process with SES lockdown enabled.
 */

import { MockHardenedSandboxService } from "./helpers/mock-sandbox";

describe("MockHardenedSandboxService", () => {
  let sandbox: MockHardenedSandboxService;

  beforeEach(() => {
    sandbox = new MockHardenedSandboxService();
  });

  afterEach(() => {
    sandbox.reset();
  });

  describe("evaluateCommonJs", () => {
    it("allows execution with explicitly permitted imports", () => {
      const result = sandbox.evaluateCommonJs<{ value: number }>({
        code: "module.exports = { value: require('allowed').answer };",
        allowedModules: { allowed: { answer: 42 } },
      });

      expect(result.value).toBe(42);
    });

    it("rejects imports outside the allowlist", () => {
      expect(() =>
        sandbox.evaluateCommonJs({
          code: "require('fs');",
        }),
      ).toThrow(/Blocked import/);
    });

    it("can use multiple allowed modules", () => {
      const result = sandbox.evaluateCommonJs<{ sum: number }>({
        code: `
          const a = require('moduleA').value;
          const b = require('moduleB').value;
          module.exports = { sum: a + b };
        `,
        allowedModules: {
          moduleA: { value: 10 },
          moduleB: { value: 32 },
        },
      });

      expect(result.sum).toBe(42);
    });

    it("can use exports pattern", () => {
      const result = sandbox.evaluateCommonJs<{ value: number }>({
        code: "exports.value = 123;",
      });

      expect(result.value).toBe(123);
    });

    it("tracks evaluation calls", () => {
      sandbox.evaluateCommonJs({
        code: "module.exports = {};",
        allowedModules: { test: {} },
      });

      expect(sandbox.evaluateCommonJsCalls).toHaveLength(1);
      expect(sandbox.evaluateCommonJsCalls[0]?.allowedModules).toEqual({
        test: {},
      });
    });

    it("can be configured to throw", () => {
      sandbox.throwOnNextCall(new Error("Sandbox failed"));

      expect(() =>
        sandbox.evaluateCommonJs({ code: "module.exports = {};" }),
      ).toThrow("Sandbox failed");
    });

    it("can return mocked results", () => {
      sandbox.mockEvaluateResult({ mocked: true });

      const result = sandbox.evaluateCommonJs<{ mocked: boolean }>({
        code: "module.exports = { mocked: false };", // This code is ignored
      });

      expect(result.mocked).toBe(true);
    });
  });

  describe("invokeFunction", () => {
    it("invokes a pure function with input", () => {
      const fn = (input: { a: number; b: number }) => input.a + input.b;

      const result = sandbox.invokeFunction(fn, { a: 10, b: 5 });

      expect(result).toBe(15);
    });

    it("handles null return values", () => {
      const fn = () => null;

      const result = sandbox.invokeFunction(fn, {});

      expect(result).toBeNull();
    });

    it("tracks function invocations", () => {
      const fn = (x: number) => x * 2;

      sandbox.invokeFunction(fn, 5);

      expect(sandbox.invokeFunctionCalls).toHaveLength(1);
      expect(sandbox.invokeFunctionCalls[0]?.input).toBe(5);
    });

    it("can be configured to throw", () => {
      sandbox.throwOnNextCall(new Error("Function failed"));

      expect(() => sandbox.invokeFunction(() => 1, {})).toThrow(
        "Function failed",
      );
    });
  });

  describe("invokeFunctionWithArgs", () => {
    it("invokes a function with multiple arguments", () => {
      const fn = (a: number, b: number, c: number) => a + b + c;

      const result = sandbox.invokeFunctionWithArgs(fn, 1, 2, 3);

      expect(result).toBe(6);
    });

    it("tracks function invocations with args", () => {
      const fn = (a: string, b: string) => a + b;

      sandbox.invokeFunctionWithArgs(fn, "hello", "world");

      expect(sandbox.invokeFunctionWithArgsCalls).toHaveLength(1);
      expect(sandbox.invokeFunctionWithArgsCalls[0]?.args).toEqual([
        "hello",
        "world",
      ]);
    });
  });

  describe("reset", () => {
    it("clears all tracked calls", () => {
      sandbox.evaluateCommonJs({ code: "module.exports = {};" });
      sandbox.invokeFunction(() => 1, {});
      sandbox.invokeFunctionWithArgs((a: number) => a, 1);

      sandbox.reset();

      expect(sandbox.evaluateCommonJsCalls).toHaveLength(0);
      expect(sandbox.invokeFunctionCalls).toHaveLength(0);
      expect(sandbox.invokeFunctionWithArgsCalls).toHaveLength(0);
    });
  });
});
