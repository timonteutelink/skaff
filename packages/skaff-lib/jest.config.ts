import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "tsx", "js"],
  roots: ["<rootDir>/tests"],
  testMatch: ["**/?(*.)+(spec|test).[tj]s?(x)"],

  // Use SWC (much faster than ts‑jest)
  transform: {
    "^.+\\.(t|j)sx?$": [
      "@swc/jest",
      {
        jsc: {
          parser: {
            syntax: "typescript",
            tsx: true,
          },
        },
      },
    ],
  },
  setupFiles: ["<rootDir>/tests/setup-env.ts"],
  moduleNameMapper: {
    "^ses$": "<rootDir>/tests/mocks/ses.ts",
    "^@timonteutelink/template-types-lib$":
      "<rootDir>/../template-types-lib/dist/index.js",
    "^@timonteutelink/skaff-plugin-greeter-types$":
      "<rootDir>/../../examples/plugins/plugin-greeter-types/src/index.ts",
    "^zod$": "<rootDir>/../../node_modules/zod",
  },

  collectCoverage: true,
  coverageDirectory: "coverage",
};

export default config;
