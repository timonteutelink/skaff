import { randomUUID } from "node:crypto";
import { Script, createContext, type Context } from "node:vm";

import { injectable } from "tsyringe";

export interface SandboxModuleOptions {
  code: string;
  filename?: string;
  dirname?: string;
  allowedModules?: Record<string, unknown>;
  globals?: Record<string, unknown>;
  timeoutMs?: number;
  /**
   * When true, the evaluated script return value will be invoked as a CommonJS-style
   * wrapper function: (exports, require, module, __filename, __dirname).
   */
  invokeResultAsCommonJsWrapper?: boolean;
}

interface CommonJsModuleEnvironment {
  exports: Record<string, unknown>;
  require: (specifier: string) => unknown;
  module: { exports: Record<string, unknown> };
  __filename: string;
  __dirname: string;
}

const DEFAULT_TIMEOUT_MS = 1_000;

const SAFE_CONSOLE = Object.freeze({
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
});

class SafeDate extends Date {
  constructor(value?: number | string | Date) {
    if (arguments.length === 0) {
      super(0);
      return;
    }
    super(value as any);
  }

  static now(): number {
    return 0;
  }
}

const SAFE_PERFORMANCE = Object.freeze({
  now: () => 0,
  mark: () => undefined,
  measure: () => undefined,
  clearMarks: () => undefined,
  clearMeasures: () => undefined,
});

const BLOCKED_GLOBALS = [
  "process",
  "Buffer",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "clearTimeout",
  "clearInterval",
  "clearImmediate",
  "fetch",
  "XMLHttpRequest",
  "Request",
  "Response",
  "Headers",
  "AbortController",
];

function createBlockedFunction(name: string) {
  return () => {
    throw new Error(`${name} is not available inside the Skaff sandbox`);
  };
}

@injectable()
export class SandboxService {
  public async runCommonJsModule<TExports = Record<string, unknown>>(
    options: SandboxModuleOptions,
  ): Promise<TExports> {
    const {
      code,
      allowedModules = {},
      globals = {},
      filename = `sandboxed-${randomUUID()}.cjs`,
      dirname = "",
      timeoutMs = DEFAULT_TIMEOUT_MS,
      invokeResultAsCommonJsWrapper = true,
    } = options;

    const moduleEnv: CommonJsModuleEnvironment = {
      exports: {},
      require: this.createRequire(allowedModules),
      module: { exports: {} },
      __filename: filename,
      __dirname: dirname,
    };

    const context = this.createIsolatedContext(moduleEnv, globals);
    const script = new Script(code, { filename, displayErrors: true });
    const result = script.runInContext(context, { timeout: timeoutMs });

    if (invokeResultAsCommonJsWrapper && typeof result === "function") {
      result(
        moduleEnv.exports,
        moduleEnv.require,
        moduleEnv.module,
        moduleEnv.__filename,
        moduleEnv.__dirname,
      );
    }

    return moduleEnv.module.exports as TExports;
  }

  private createRequire(allowedModules: Record<string, unknown>) {
    const allowList = { ...allowedModules };
    return (specifier: string) => {
      if (specifier in allowList) return allowList[specifier];
      const root = specifier.split("/", 1)[0]!;
      if (root in allowList) return allowList[root];
      throw new Error(`Blocked import in sandbox: ${specifier}`);
    };
  }

  private createIsolatedContext(
    moduleEnv: CommonJsModuleEnvironment,
    globals: Record<string, unknown>,
  ): Context {
    const baseGlobals: Record<string, unknown> = {
      console: SAFE_CONSOLE,
      TextEncoder,
      TextDecoder,
      URL,
      URLSearchParams,
      Date: SafeDate,
      performance: SAFE_PERFORMANCE,
      ...globals,
    };

    for (const key of BLOCKED_GLOBALS) {
      baseGlobals[key] = createBlockedFunction(key);
    }

    const context = createContext(baseGlobals, {
      codeGeneration: { strings: false, wasm: false },
      microtaskMode: "afterEvaluate",
    });

    const globalRef = (context as any).globalThis ?? (context as any);

    Object.assign(globalRef, moduleEnv);

    for (const key of BLOCKED_GLOBALS) {
      globalRef[key] = createBlockedFunction(key);
    }

    globalRef.global = undefined;
    globalRef.globalThis = globalRef;

    this.freezePrimitiveGlobals(globalRef);

    return context;
  }

  private freezePrimitiveGlobals(context: any) {
    const primitives = [
      "Object",
      "Array",
      "Map",
      "Set",
      "WeakMap",
      "WeakSet",
      "Number",
      "BigInt",
      "String",
      "Boolean",
      "RegExp",
      "Symbol",
      "Math",
      "JSON",
      "Intl",
      "URL",
      "URLSearchParams",
      "TextEncoder",
      "TextDecoder",
      "Date",
      "performance",
    ];

    for (const key of primitives) {
      if (context[key]) {
        Object.freeze(context[key]);
      }
    }

    if (context.console) {
      Object.freeze(context.console);
    }
  }
}

export function resolveSandboxService(): SandboxService {
  const { getSkaffContainer } = require("../../di/container");
  const { SandboxServiceToken } = require("../../di/tokens");
  return getSkaffContainer().resolve(SandboxServiceToken);
}
