import { registerPluginModules } from "@timonteutelink/skaff-lib";

import { INSTALLED_PLUGINS } from "./generated-plugin-registry";

let registered = false;

export function ensureWebPluginsRegistered(): void {
  if (registered) return;
  const entries = Object.values(INSTALLED_PLUGINS).map((entry) => ({
    moduleExports: entry.module,
    packageName: entry.packageName,
  }));

  if (entries.length > 0) {
    registerPluginModules(entries);
  }
  registered = true;
}
