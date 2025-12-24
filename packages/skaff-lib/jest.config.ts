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
            tsx: false,
          },
        },
      },
    ],
  },
  moduleNameMapper: {
    "^@timonteutelink/template-types-lib$":
      "<rootDir>/../template-types-lib/src/index.ts",
    "^@timonteutelink/skaff-lib$": "<rootDir>/src/index.ts",
  },
  setupFiles: ["<rootDir>/tests/setup-env.ts"],

  collectCoverage: true,
  coverageDirectory: "coverage",
};

export default config;
