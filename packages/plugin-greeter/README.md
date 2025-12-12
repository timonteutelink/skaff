# Skaff greeter plugin

A reference template-generation plugin that logs a friendly greeting during
instantiation and stores plugin-scoped data in `templateSettings.json`. The CLI
and web contributions live in sibling packages so React and Inquirer stay
isolated:

- `@timonteutelink/skaff-plugin-greeter` – template generation hook
- `@timonteutelink/skaff-plugin-greeter-cli` – CLI commands and interactive
  stages
- `@timonteutelink/skaff-plugin-greeter-web` – web UI notices and stage content

## Usage

Add the greeter modules to a template's `plugins` array. You can include just the
pieces you need or all of them using the helper from
`@timonteutelink/skaff-plugin-greeter-types`:

```ts
import { useGreeterPlugins } from "@timonteutelink/skaff-plugin-greeter-types";

export const templateConfig = {
  // ...existing config
  plugins: useGreeterPlugins({ greeting: "Hello from the greeter plugin!" }),
};
```

When the template instantiates, the base plugin logs a greeting and stores its
state under `instantiatedTemplates.<id>.plugins.greeter` inside
`templateSettings.json`.

The CLI package exposes a `greet` command via `skaff plugin run --list` and adds
before/after settings stages. The web package renders the same stages as React
components around the settings form and displays a notice next to each project.
