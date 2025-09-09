import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config, { isServer }) {
    config.externals = config.externals || [];

    if(isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        handlebars: "handlebars/dist/handlebars.js",
        esbuild: false,
      };
    }

    return config;
  },

  serverExternalPackages: ["esbuild", "node:vm"],

  output: "standalone",
};

export default nextConfig;

