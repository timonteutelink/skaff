# Template settings schema reference

The template settings UI now consumes the JSON Schema that Zod 4 produces via [`z.toJSONSchema`](https://github.com/colinhacks/zod). The new serializer emits [JSON Schema 2020-12](https://json-schema.org/draft/2020-12/json-schema-validation.html) documents, which differ from the bespoke `zod-to-json-schema` output that the previous UI targeted. The table below highlights the key differences we observed when running quick probes such as:

```bash
node -e "const z=require('zod');const schema=z.object({ foo:z.string().nullable(), tags:z.tuple([z.string(),z.number()]).rest(z.boolean()), choice:z.discriminatedUnion('type',[z.object({type:z.literal('a'),value:z.string()}),z.object({type:z.literal('b'),flag:z.boolean()})]), settings:z.record(z.string().min(2),z.enum(['dev','prod'])).meta({category:'Advanced'}) });console.log(JSON.stringify(z.toJSONSchema(schema),null,2));"
```

| Concern | Zod 4 serializer output | Previous expectation |
| --- | --- | --- |
| Draft version | Every schema includes a `$schema: "https://json-schema.org/draft/2020-12/schema"` header. | No explicit draft reference. |
| Tuples | Tuple members live under `prefixItems` (with optional `items` for rest clauses). | Members were nested under `items`. |
| Nullable fields | Nullable primitives use `anyOf` with a `{ "type": "null" }` variant. | A custom `nullable` flag (or `type: ["string", "null"]`) was expected. |
| Enums | Enum nodes look like regular primitives (`{ type: "string", enum: [...] }`). | Dedicated `type: "enum"` nodes with a `values` array. |
| Records | Record keys expose their constraints via `propertyNames`; the values live under `additionalProperties`. | Only `additionalProperties` was provided. |
| Metadata | Values passed through `.meta()` are copied verbatim onto the schema node (e.g. `category`, `readOnly`). | Metadata lived under a nested `metadata` key. |
| Intersections | `.and()` / `.intersection()` schemas show up under `allOf` and need to be merged before rendering or validation. | Not previously surfaced. |
| Unions | Unions use `anyOf`; discriminated unions encode literal discriminator values via `{ "const": "foo" }`. | Custom discriminators were stored outside `anyOf`. |

The helpers in `schema-utils.ts` normalize these shapes so tuples, unions, nullable primitives, and record entries continue to behave exactly like the underlying Zod schema.
