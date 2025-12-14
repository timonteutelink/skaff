# Skaff greeter web plugin

Wraps the Skaff web template instantiation flow with greeter-specific UI
contributions. The plugin renders pages before and after the settings form and
surfaces a notice alongside each instantiated project.

Add it next to the base greeter plugin to enable the UI behavior:

```ts
import { useGreeterTemplatePlugin } from "@timonteutelink/skaff-plugin-greeter-types";
import { greeterWebPluginSpecifier } from "@timonteutelink/skaff-plugin-greeter-types";

export const templateConfig = {
  // ...existing config
  plugins: [useGreeterTemplatePlugin(), { module: greeterWebPluginSpecifier }],
};
```
