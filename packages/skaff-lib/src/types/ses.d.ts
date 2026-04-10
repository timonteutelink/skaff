declare global {
  function lockdown(options?: Record<string, unknown>): void;
  function harden<T>(value: T): T;

  class Compartment {
    globalThis: Record<string, unknown>;
    constructor(options?: {
      globals?: Record<string, unknown>;
      __options__?: boolean;
    });
    evaluate<T = unknown>(code: string): T;
  }
}

export {};
