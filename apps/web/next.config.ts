import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({ esbuild: "commonjs esbuild" });
      config.resolve.alias = {
        ...config.resolve.alias,
        handlebars: "handlebars/dist/handlebars.js",
      };
    }

    return config;
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
