import { randomUUID } from "node:crypto";
import "server-only";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export async function initEsbuild(): Promise<typeof import("esbuild")> {
  if ((globalThis as any).esbuild) return (globalThis as any).esbuild;

  // 1. ───── Bun (must be first – covers compiled single-file binary) ──────
  if (typeof (globalThis as any).Bun !== "undefined") {
    const shim = createBunEsbuildShim();
    (globalThis as any).esbuild = shim;
    return shim as unknown as typeof import("esbuild");
  }

  // 2. ───── Deno ──────────────────────────────────────────────────────────
  if (typeof (globalThis as any).Deno !== "undefined") {
    // @ts-ignore remote import for Deno
    const mod = await import(/* webpackIgnore: true */ "https://deno.land/x/esbuild@v0.25.2/mod.js");
    (globalThis as any).esbuild = mod;
    return mod as unknown as typeof import("esbuild");
  }

  // 3. ───── Node (CJS •or• ESM) ───────────────────────────────────────────
  let mod: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require("esbuild");
  } catch {
    mod = await import("esbuild");
  }
  (globalThis as any).esbuild = mod;
  return mod as unknown as typeof import("esbuild");
}

/** previous top-level convenience export */
export const esbuildPromise = initEsbuild();

// ───────────────────────────────────────────────────────────────────────────
// BUN SHIM — a *thin* subset of esbuild implemented with Bun.build()
// ───────────────────────────────────────────────────────────────────────────

function createBunEsbuildShim() {
  /** translate esbuild’s `"es2022"` etc. ⟶ a Bun target */
  function mapTarget(
    target: unknown,
  ): "browser" | "bun" | "node" | undefined {
    if (typeof target !== "string") return undefined;
    if (["browser", "bun", "node"].includes(target)) return target as any;
    return "bun"; // safe default
  }

  /** Convert Bun.build() → the subset of esbuild’s BuildResult our code uses */
  async function bunToEsbuild(bun: any) {
    const outputFiles = await bun.outputs.map(async (o: any) => ({
      path: o.path,
      text: await o.text(),
      contents: new Uint8Array(o.arrayBuffer()),
    }));
    return { outputFiles: await Promise.all(outputFiles), warnings: [], errors: [] };
  }

  /** Minimal build() that accepts the options our project passes */
  async function build(opts: any): Promise<any> {
    // ── stdin build (used by loadAllTemplateConfigs) ──────────────────────
    if (opts.stdin) {
      const {
        contents,
        loader = "ts",
        resolveDir,
      } = opts.stdin as {
        contents: string;
        loader?: string;
        resolveDir?: string;
      };

      // place temp file in resolveDir so *relative* imports behave identically
      const dir = resolveDir ? path.resolve(resolveDir) : process.cwd();
      const tmpFile = path.join(dir, `.stdin_${randomUUID()}.${loader}`);
      await fs.writeFile(tmpFile, contents, "utf8");

      try {
        const bunOut = await Bun.build({
          entrypoints: [tmpFile],
          format: opts.format ?? "esm",
          target: mapTarget(opts.target),
          external: (opts.external ?? []) as string[],
          minify: Boolean(opts.minify),
          sourcemap: "none",
        });
        return await bunToEsbuild(bunOut);
      } finally {
        await fs.unlink(tmpFile).catch(() => { });
      }
    }

    // ── Fallback: no stdin supplied — sanitise options then delegate ─────
    const { bundle, write, ...rest } = opts; // strip esbuild-only fields
    const bunOut = await Bun.build({
      ...rest,
      target: mapTarget(opts.target),
    } as any);
    return bunToEsbuild(bunOut);
  }

  async function stop() {
    /* esbuild.stop() closes a service process; Bun has nothing to stop */
  }

  return { build, stop };
}

