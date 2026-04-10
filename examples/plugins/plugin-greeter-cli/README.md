# Skaff greeter CLI plugin

Provides the CLI-facing pieces of the greeter plugin: an extra `greet` command
and interactive stages that wrap the template settings prompts.

Include this module alongside the base greeter plugin in a template's `plugins`
array to light up the CLI behavior:

```ts
import { useGreeterTemplatePlugin } from "@timonteutelink/skaff-plugin-greeter-types";
import { greeterCliPluginSpecifier } from "@timonteutelink/skaff-plugin-greeter-types";

export const templateConfig = {
  // ...existing config
  plugins: [useGreeterTemplatePlugin(), { module: greeterCliPluginSpecifier }],
};
```

Use `skaff plugin run --list` to see the available commands and
`skaff plugin run --command greeter:greet` to invoke the greeting.
