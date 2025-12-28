import {
  registerPluginModules,
  registerPluginSandboxLibraries,
} from "@timonteutelink/skaff-lib";

import { INSTALLED_PLUGINS } from "./generated-plugin-registry";
import {
  REACT_JSX_RUNTIME_SANDBOX_STUB,
  REACT_SANDBOX_STUB,
} from "./react-sandbox-stub";

let registered = false;

export function ensureWebPluginsRegistered(): void {
  if (registered) return;
  registerPluginSandboxLibraries({
    react: REACT_SANDBOX_STUB,
    "react/jsx-runtime": REACT_JSX_RUNTIME_SANDBOX_STUB,
  });
  const entries = Object.values(INSTALLED_PLUGINS).map((entry) => ({
    moduleExports: entry.module,
    modulePath: entry.modulePath,
    packageName: entry.packageName,
  }));

  if (entries.length > 0) {
    registerPluginModules(entries);
  }
  registered = true;
}
