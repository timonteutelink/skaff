import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config, { isServer }) {
    if (isServer) {
      if (Array.isArray(config.externals)) {
        config.externals.push("esbuild");
      } else if (config.externals) {
        config.externals = [config.externals, "esbuild"];
      } else {
        config.externals = ["esbuild"];
      }

      config.resolve.alias = {
        ...config.resolve.alias,
        handlebars: "handlebars/dist/handlebars.js",
      };
    }

    return config;
  },

  serverExternalPackages: ["esbuild", "node:vm"],

  output: "standalone",
};

export default nextConfig;

