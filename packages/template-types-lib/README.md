# template-types-lib

This package provides the shared TypeScript types and Zod schemas used when authoring `templateConfig.ts` files, including `TemplateConfigModule`, project settings helpers, and other utilities template authors rely on.

## Key Exports

- **`TemplateConfig`** – Strongly typed metadata describing a template (name, author, spec version, etc.).
- **`TemplateConfigModule`** – The contract every `templateConfig.ts` module implements to expose settings schemas, helpers, and lifecycle hooks.
- **`projectSettingsSchema`** – Zod schema (with matching `ProjectSettings` type) for validating the generated project's global metadata and instantiated templates.

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
};

export default templateModule;
```

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
