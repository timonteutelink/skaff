import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals = config.externals || [];
      config.resolve.alias = {
        ...config.resolve.alias,
        handlebars: "handlebars/dist/handlebars.js",
      };
    }

    return config;
  },
  serverExternalPackages: ["esbuild", "pino"],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
