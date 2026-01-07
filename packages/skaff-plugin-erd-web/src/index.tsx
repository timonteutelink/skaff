"use client";

import type { WebPluginContribution } from "@timonteutelink/skaff-lib";

const erdWebContribution: WebPluginContribution = {
  templateStages: [],
};

const erdWebPlugin = {
  manifest: {
    name: "erd",
    version: "0.0.0",
    capabilities: ["web"],
    supportedHooks: { template: [], cli: [], web: [] },
  },
  web: erdWebContribution,
};

export default erdWebPlugin;
