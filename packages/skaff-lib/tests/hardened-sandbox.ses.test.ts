import { HardenedSandboxService } from "../src/core/infra/hardened-sandbox";

describe("HardenedSandboxService (SES)", () => {
  let sandbox: HardenedSandboxService;

  beforeEach(() => {
    sandbox = new HardenedSandboxService();
  });

  it("evaluates CommonJS modules with allowed imports", () => {
    const result = sandbox.evaluateCommonJs<{ value: number }>({
      code: "module.exports = { value: require('allowed').answer };",
      allowedModules: { allowed: { answer: 42 } },
      filename: "allowed.js",
    });

    expect(result.value).toBe(42);
  });

  it("blocks imports outside the allowlist", () => {
    expect(() =>
      sandbox.evaluateCommonJs({
        code: "require('fs');",
        filename: "blocked.js",
      }),
    ).toThrow('Blocked import in sandbox: "fs"');
  });

  it("rejects invalid module specifiers", () => {
    expect(() =>
      sandbox.evaluateCommonJs({
        code: "require('../escape');",
        filename: "invalid.js",
      }),
    ).toThrow('Invalid module specifier in sandbox: "../escape"');
  });

  it("does not expose Node globals in the compartment", () => {
    const result = sandbox.evaluateCommonJs<{ hasProcess: boolean }>({
      code: "module.exports = { hasProcess: typeof process !== 'undefined' };",
      filename: "globals.js",
    });

    expect(result.hasProcess).toBe(false);
  });

  it("hardens module exports", () => {
    const result = sandbox.evaluateCommonJs<{ nested: { value: number } }>({
      code: "module.exports = { nested: { value: 1 } };",
      filename: "harden.js",
    });

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.nested)).toBe(true);
  });

  it("hardens invokeFunction input and output", () => {
    const fn = sandbox.evaluateCommonJs<{
      mutate: (input: { count: number }) => number;
    }>({
      code: `
        module.exports = {
          mutate(input) {
            "use strict";
            input.count += 1;
            return input.count;
          }
        };
      `,
      filename: "invoke.js",
    });

    expect(() => sandbox.invokeFunction(fn.mutate, { count: 1 })).toThrow(
      "Cannot assign to read only property",
    );
  });
});
