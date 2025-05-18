import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "tsx"],
  roots: ["<rootDir>/tests"],
  testMatch: ["**/?(*.)+(spec|test).[tj]s?(x)"],

  // Use SWC (much faster than ts‑jest)
  transform: { "^.+\\.(t|j)sx?$": "@swc/jest" },

  collectCoverage: true,
  coverageDirectory: "coverage",
};

export default config;
