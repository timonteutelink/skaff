# @timonteutelink/skaff-plugin-greeter-types

Type-only helpers for the greeter plugin family. Templates can import these
utilities to strongly type their plugin configuration without pulling any
runtime dependencies.

```ts
import { useGreeterPlugins } from "@timonteutelink/skaff-plugin-greeter-types";

export const templateConfig = {
  // ...existing config
  plugins: useGreeterPlugins({ greeting: "hello" }),
};
```

## Exports

- **`GREETER_PLUGIN_NAME`** – shared name for plugin-scoped settings.
- **`GREETER_STAGE_STATE_KEY`** – default state key for before/after stages.
- **`greeterTemplatePluginSpecifier`**, **`greeterCliPluginSpecifier`**,
  **`greeterWebPluginSpecifier`** – module specifiers for the individual
  runtime packages.
- **`useGreeterTemplatePlugin(options?)`** – helper for configuring only the
  template-generation hook.
- **`useGreeterPlugins(options?)`** – convenience tuple that enables all three
  greeter modules (template, CLI, and web UI) with a single helper.
