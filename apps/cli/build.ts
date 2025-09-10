
await Bun.build({
  entrypoints: ["./src/index.ts"],
  format: "esm",
  outdir: "./dist",
  plugins: [],
  target: "bun",
});

export {};
