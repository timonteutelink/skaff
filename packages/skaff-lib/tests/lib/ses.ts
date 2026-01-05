const noop = () => undefined;

if (typeof globalThis.lockdown !== "function") {
  globalThis.lockdown = noop;
}

if (typeof globalThis.harden !== "function") {
  globalThis.harden = (<T>(value: T) => value) as typeof globalThis.harden;
}

if (typeof (globalThis as { Compartment?: unknown }).Compartment !== "function") {
  class MockCompartment {
    public globalThis: Record<string, unknown>;

    constructor(options?: { globals?: Record<string, unknown> }) {
      this.globalThis = options?.globals ?? {};
    }

    public evaluate(code: string): unknown {
      const argNames = Object.keys(this.globalThis);
      const argValues = Object.values(this.globalThis);
      const evaluator = new Function(
        ...argNames,
        `"use strict"; return (${code});`,
      );
      return evaluator(...argValues);
    }
  }

  (globalThis as { Compartment?: unknown }).Compartment = MockCompartment;
}

export {};
