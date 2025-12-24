const noop = () => undefined;

if (typeof globalThis.lockdown !== "function") {
  globalThis.lockdown = noop;
}

if (typeof globalThis.harden !== "function") {
  globalThis.harden = (<T>(value: T) => value) as typeof globalThis.harden;
}

export {};
