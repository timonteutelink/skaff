import { initEsbuild } from "../src/utils/get-esbuild";

describe("get-esbuild", () => {
  it("caches esbuild instance", async () => {
    delete (globalThis as any).esbuild;
    const first = await initEsbuild();
    const second = await initEsbuild();
    expect(first).toBe(second);
  });
});
