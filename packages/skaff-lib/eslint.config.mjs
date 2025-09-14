import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";
import onlyWarn from "eslint-plugin-only-warn";

export default [
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  {
    plugins: { onlyWarn },
  },
  {
    ignores: ["dist/**"],
  },
];
