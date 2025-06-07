import { bunPluginPino } from "bun-plugin-pino";

await Bun.build({
  entrypoints: ["./src/index.ts"],
  format: "esm",
  outdir: "./dist",
  plugins: [bunPluginPino()],
  target: "bun",
});

// await cp(
//   join("node_modules", "@types", "node"),
//   join("dist", "internal-types", "node"),
//   { recursive: true, dereference: true },
// );
