import { bunPluginPino } from "bun-plugin-pino";

await Bun.build({
  entrypoints: ["./src/main.ts"],
  outdir: "./dist",
  target: "bun",
  format: "esm",
  plugins: [bunPluginPino()],
});

// await cp(
//   join("node_modules", "@types", "node"),
//   join("dist", "internal-types", "node"),
//   { recursive: true, dereference: true },
// );
