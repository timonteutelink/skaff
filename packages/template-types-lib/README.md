# template-types-lib

This package provides the shared TypeScript types and Zod schemas used when authoring `templateConfig.ts` files, including `TemplateConfigModule`, project settings helpers, and other utilities template authors rely on.

## Key Exports

- **`TemplateConfig`** – Strongly typed metadata describing a template (name, author, spec version, etc.).
- **`TemplateConfigModule`** – The contract every `templateConfig.ts` module implements to expose settings schemas, helpers, and lifecycle hooks.
- **`projectSettingsSchema`** – Zod schema (with matching `ProjectSettings` type) for validating the generated project's global metadata and instantiated templates.
- **`TemplatePluginConfig`** – Declares the plugin module specifier, optional export name, dependency/weight ordering hints, and options passed to Skaff's plugin loader when a template opts into plugins.

## Usage

```ts
import { z } from "zod";
import type {
  TemplateConfig,
  TemplateConfigModule,
  FinalTemplateSettings,
} from "@timonteutelink/template-types-lib";

const templateSettingsSchema = z.object({
  greeting: z.string().default("hello"),
});

const templateConfig: TemplateConfig = {
  name: "hello-world",
  author: "Example Templates",
  specVersion: "1.0.0",
  isRootTemplate: true,
};

const templateModule: TemplateConfigModule<
  FinalTemplateSettings,
  typeof templateSettingsSchema
> = {
  templateConfig,
  templateSettingsSchema,
  templateFinalSettingsSchema: templateSettingsSchema,
  mapFinalSettings: ({ templateSettings }) => templateSettings,
  plugins: [
    // Base greeter template hook plus CLI and web contributions
    { module: "@timonteutelink/skaff-plugin-greeter", options: { greeting: "hello" } },
    "@timonteutelink/skaff-plugin-greeter-cli",
    "@timonteutelink/skaff-plugin-greeter-web",
  ],
};

export default templateModule;
```

### Plugin configuration

Template authors can opt into plugins by adding a `plugins` array to the exported `TemplateConfigModule`. Each entry is a
`TemplatePluginConfig` describing the module specifier (resolved from the template repository's `package.json`), the export to
load (defaults to `default`), optional dependency/weight hints to stabilize execution order, and optional plugin-specific
options. The Skaff library exposes a shared loader that the CLI and Web UI reuse to import these modules at runtime, ensuring
plugins only activate for templates that explicitly list them.

Plugin settings live in the template’s own `templateSettingsSchema`. Plugins can
read and suggest settings through their CLI/Web stages, while templates remain
the single source of truth for stored settings.

## Template Layout Example

Templates often follow a layered structure where the root `templateConfig.ts` defines global settings and delegates to optional
subtemplates for stack-specific features. A simplified project might look like the following:

```
nextjs-app/
├─ templateConfig.ts
├─ templates/  (... base app files ...)
└─ subtemplates/
    ├─ tailwind/        # subtemplate for adding Tailwind CSS
    │   ├─ templateConfig.ts
    │   └─ templates/ (... tailwind config files ...)
    └─ auth/
        ├─ templateConfig.ts
        └─ templates/  (... auth module files ...)
```

Each `templateConfig.ts` composes its own schemas and exports a `TemplateConfigModule`, letting template authors mix and match
features (like Tailwind or auth) while reusing the shared types and validation helpers from this package.

For a deeper dive into advanced configuration patterns, AI helpers, and subtemplates, see the [Template Authoring Guide](../docs/src/docs/guides/template-authoring.mdx) in `packages/docs`.
