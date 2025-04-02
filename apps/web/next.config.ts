import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	webpack(config, { isServer }) {
		if (isServer) {
			config.externals = config.externals || [];
			config.externals.push({ esbuild: 'commonjs esbuild' });
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
