# ERD plugin (prototype)

This plugin will allow a template that takes a json schema like https://docs.erd-editor.io/docs/api/advanced/schema or something similar as an input. Then when generating a template using this plugin you can use a json file following this schema OR if in the web interface we embed before the templatesettings this erd editor. By allow the user to create a bidirectional mapping between the json schema the template needs and this json erd editor schema the user will also be able to use modifytemplate and edit the erd(templateSettings->erdschema then edit then new erdschema->templatesettings) and then continue to settings page!

## Plugin plan

1. **Types-only package** (`@timonteutelink/skaff-plugin-erd-types`)
   - Export the ERD schema Zod validator (`erdSchemaZod`) and its inferred type (`ErdSchema`).
   - Export mapper types (`ErdTemplateMappers`) and optional settings shape (`ErdTemplateSettings`).
   - Template configs import these types without pulling runtime/web code.

2. **Runtime plugin package** (`@timonteutelink/skaff-plugin-erd`)
   - Validate mapper functions with Zod at runtime.
   - Provide transformation utilities for `templateSettings ↔ ERD schema`.
   - Validate ERD input and mapped template settings output when mapping.

3. **Web UI plugin package** (`@timonteutelink/skaff-plugin-erd-web`)
   - Add a `before-settings` stage that embeds the ERD editor.
   - Flow:
     1. read current template settings
     2. map them to ERD schema
     3. let the user edit in the ERD editor
     4. map back to template settings
     5. call `setSettingsDraft`
     6. continue to the standard settings form

## Template mapper config

Templates must provide mapper functions through `templateConfig.plugins[].options`.

```ts
import type { ErdTemplateMappers } from "@timonteutelink/skaff-plugin-erd-types";

const mappers: ErdTemplateMappers = {
  toErd: (settings) => ({
    $schema:
      "https://raw.githubusercontent.com/dineug/erd-editor/main/json-schema/schema.json",
    version: "3.0.0",
    settings: settings.erdSettings as any,
    doc: settings.erdDoc as any,
    collections: settings.erdCollections as any,
  }),
  fromErd: (erd) => ({
    erdSettings: erd.settings,
    erdDoc: erd.doc,
    erdCollections: erd.collections,
  }),
};

export const templateConfig = {
  plugins: [
    {
      module: "@timonteutelink/skaff-plugin-erd",
      options: { mappers },
    },
  ],
};
```

### Mapper functions

- `mappers.toErd(settings)` converts template settings into an ERD schema object.
- `mappers.fromErd(erd)` converts ERD schema input into template settings.

The plugin runtime validates:
- Input ERD schema via `erdSchemaZod`.
- Output settings via a provided template settings Zod schema (when mapping).

## Schema support

`erdSchemaZod` mirrors the ERD Editor **V3** schema from the erd-editor project (see `packages/erd-editor-schema/src/v3/schema/*` in the upstream repository). Templates can reuse or extend this schema when defining validation logic around ERD inputs.
