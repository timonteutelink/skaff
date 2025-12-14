import { SandboxService } from "../src/core/infra/sandbox-service";

describe("SandboxService", () => {
  const sandbox = new SandboxService();

  it("allows execution with explicitly permitted imports", async () => {
    const result = await sandbox.runCommonJsModule<{ value: number }>({
      code: "module.exports = { value: require('allowed').answer };",
      allowedModules: { allowed: { answer: 42 } },
      invokeResultAsCommonJsWrapper: false,
    });

    expect(result.value).toBe(42);
  });

  it("rejects imports outside the allowlist", async () => {
    await expect(
      sandbox.runCommonJsModule({
        code: "require('fs');",
        timeoutMs: 50,
        invokeResultAsCommonJsWrapper: false,
      }),
    ).rejects.toThrow(/Blocked import/);
  });

  it("replaces timing and async primitives with throwing stubs", async () => {
    const result = await sandbox.runCommonJsModule<{ timer: string; now: number }>(
      {
        code: [
          "let timerResult = 'ok';",
          "try { setTimeout(() => {}); } catch (error) { timerResult = error.message; }",
          "module.exports = { timer: timerResult, now: Date.now() };",
        ].join("\n"),
        timeoutMs: 50,
        invokeResultAsCommonJsWrapper: false,
      },
    );

    expect(result.timer).toMatch(/not available/);
    expect(result.now).toBe(0);
  });

  it("enforces execution timeouts", async () => {
    await expect(
      sandbox.runCommonJsModule({
        code: "while (true) {}",
        timeoutMs: 10,
        invokeResultAsCommonJsWrapper: false,
      }),
    ).rejects.toThrow();
  });
});
