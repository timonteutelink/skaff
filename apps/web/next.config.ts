import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config, { isServer }) {
    if (isServer) {
      const externalsToAdd = ["esbuild", "typescript"];
      if (Array.isArray(config.externals)) {
        config.externals.push(...externalsToAdd);
      } else if (config.externals) {
        config.externals = [config.externals, ...externalsToAdd];
      } else {
        config.externals = externalsToAdd;
      }

      config.resolve.alias = {
        ...config.resolve.alias,
        handlebars: "handlebars/dist/handlebars.js",
      };
    }

    return config;
  },

  serverExternalPackages: ["esbuild", "typescript", "node:vm"],

  output: "standalone",
};

export default nextConfig;

