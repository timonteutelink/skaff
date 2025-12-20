import type { LoadedTemplatePlugin } from "../src/core/plugins/plugin-types";
import { sortLoadedPluginsForLifecycle } from "../src/core/plugins/plugin-types";

function createPlugin(
  name: string,
  reference: LoadedTemplatePlugin["reference"],
): LoadedTemplatePlugin {
  return {
    name,
    version: "1.0.0",
    reference,
    module: {} as LoadedTemplatePlugin["module"],
  };
}

describe("plugin ordering", () => {
  it("stabilizes ordering with weights and dependencies", () => {
    const plugins = [
      createPlugin("plugin-c", { module: "plugin-c" }),
      createPlugin("plugin-b", {
        module: "plugin-b",
        dependsOn: ["plugin-a"],
      }),
      createPlugin("plugin-a", { module: "plugin-a" }),
      createPlugin("plugin-d", { module: "plugin-d", weight: -10 }),
    ];

    const order = sortLoadedPluginsForLifecycle(plugins).map(
      (plugin) => plugin.name,
    );
    const repeatedOrder = sortLoadedPluginsForLifecycle(plugins).map(
      (plugin) => plugin.name,
    );

    expect(order).toEqual(["plugin-d", "plugin-c", "plugin-a", "plugin-b"]);
    expect(repeatedOrder).toEqual(order);
  });
});
