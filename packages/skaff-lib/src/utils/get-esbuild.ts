import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { injectable } from "tsyringe";

import { getSkaffContainer } from "../di/container";
import { EsbuildInitializerToken } from "../di/tokens";

@injectable()
export class EsbuildInitializer {
  private cachedModule: typeof import("esbuild") | null = null;

  public async init(): Promise<typeof import("esbuild")> {
    if ((globalThis as any).esbuild) {
      return (globalThis as any).esbuild;
    }

    if (this.cachedModule) {
      return this.cachedModule;
    }

    const module = await this.loadEsbuild();
    (globalThis as any).esbuild = module;
    this.cachedModule = module;
    return module;
  }

  private async loadEsbuild(): Promise<typeof import("esbuild")> {
    if (typeof (globalThis as any).Bun !== "undefined") {
      const shim = await this.createBunEsbuildShim();
      return shim as unknown as typeof import("esbuild");
    }

    if (typeof (globalThis as any).Deno !== "undefined") {
      // @ts-ignore remote import for Deno
      const mod = await import(/* webpackIgnore: true */ "https://deno.land/x/esbuild@v0.25.2/mod.js");
      return mod as unknown as typeof import("esbuild");
    }

    let mod: unknown;
    try {
      mod = require("esbuild");
    } catch {
      mod = await import("esbuild");
    }
    return mod as unknown as typeof import("esbuild");
  }

  private async createBunEsbuildShim(): Promise<any> {
    const mapTarget = (target: unknown): "browser" | "bun" | "node" | undefined => {
      if (typeof target !== "string") return undefined;
      if (["browser", "bun", "node"].includes(target)) return target as any;
      return "bun";
    };

    const bunToEsbuild = async (bun: any) => {
      const outputFiles = await bun.outputs.map(async (o: any) => ({
        path: o.path,
        text: await o.text(),
        contents: new Uint8Array(o.arrayBuffer()),
      }));
      return { outputFiles: await Promise.all(outputFiles), warnings: [], errors: [] };
    };

    const build = async (opts: any): Promise<any> => {
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

      const { bundle, write, ...rest } = opts;
      const bunOut = await Bun.build({
        ...rest,
        target: mapTarget(opts.target),
      } as any);
      return bunToEsbuild(bunOut);
    };

    const stop = async () => {
      /* esbuild.stop() closes a service process; Bun has nothing to stop */
    };

    const api: any = { build, stop };
    Object.defineProperty(api, "__esModule", { value: true });
    api.default = api;

    return api;
  }
}

export async function initEsbuild(): Promise<typeof import("esbuild")> {
  const initializer = getSkaffContainer().resolve(EsbuildInitializerToken);
  return initializer.init();
}

