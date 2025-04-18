async function initEsbuild() {
  if ((globalThis as any).esbuild) {
    return (globalThis as any).esbuild;
  }

  let mod;
  if (typeof (globalThis as any).Deno !== "undefined") {
    // @ts-expect-error Cannot import module
    mod = await import(/* webpackIgnore: true */ "https://deno.land/x/esbuild@v0.25.2/mod.js");
  } else {
    mod = require("esbuild");
  }

  (globalThis as any).esbuild = mod;

  return mod;
}

export async function getEsbuild(): Promise<any> {
  return await initEsbuild();
}

export const esbuildPromise = initEsbuild();
