import { anyOrCallbackToAny, stringOrCallbackToString, logError } from "../src/lib/utils";
import type { Result } from "../src/lib/types";

jest.mock("../src/lib/logger", () => {
  const log = jest.fn();
  return {
    backendLogger: {
      error: log,
      warn: log,
      info: log,
      debug: log,
      trace: log,
      fatal: log,
    },
  };
});

const { backendLogger } = require("../src/lib/logger");

describe("lib-utils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("anyOrCallbackToAny", () => {
    it("returns direct value", () => {
      const result = anyOrCallbackToAny("hello", {} as any);
      expect(result).toEqual({ data: "hello" });
    });

    it("resolves callback value", () => {
      const fn = jest.fn().mockReturnValue(5);
      const result = anyOrCallbackToAny(fn as any, { foo: "bar" } as any);
      expect(fn).toHaveBeenCalledWith({ foo: "bar" });
      expect(result).toEqual({ data: 5 });
    });

    it("handles thrown errors", () => {
      const fn = () => {
        throw new Error("boom");
      };
      const result = anyOrCallbackToAny(fn as any, {} as any);
      expect(result).toHaveProperty("error");
      expect(backendLogger.error).toHaveBeenCalled();
    });
  });

  it("converts string or callback to string", () => {
    const res1 = stringOrCallbackToString("abc", {} as any);
    expect(res1).toEqual({ data: "abc" });

    const res2 = stringOrCallbackToString(() => "def", {} as any);
    expect(res2).toEqual({ data: "def" });
  });

  describe("logError", () => {
    it("logs provided error", () => {
      const result = logError({ shortMessage: "oops", error: new Error("fail") });
      expect(result).toBe(false);
      expect(backendLogger.error).toHaveBeenCalled();
    });

    it("logs result error", () => {
      const result = logError({ shortMessage: "bad", result: { error: "x" } as Result<any> });
      expect(result).toBe(false);
      expect(backendLogger.error).toHaveBeenCalled();
    });

    it("logs when data is null with message", () => {
      const result = logError({
        shortMessage: "null",
        nullErrorMessage: "was null",
        result: { data: null } as Result<any>,
      });
      expect(result).toBe(false);
      expect(backendLogger.error).toHaveBeenCalled();
    });

    it("returns data when no error", () => {
      const result = logError({ shortMessage: "ok", result: { data: 42 } as Result<number> });
      expect(result).toBe(42);
      expect(backendLogger.error).not.toHaveBeenCalled();
    });
  });
});
