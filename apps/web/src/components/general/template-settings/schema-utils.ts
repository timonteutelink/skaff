import * as z from "zod";
import type { SchemaResult } from "./types";

// The new Zod 4 native serializer (z.toJSONSchema) produces JSON Schema 2020-12
// compatible shapes. Compared to the previous zod-to-json-schema output:
// - tuples now expose their members under `prefixItems` instead of `items`
// - enums surface as `{ type: "string", enum: [...] }` (no custom `type: "enum"`)
// - simple nullable fields are encoded as `anyOf` unions that include `{ type: "null" }`
// - records include `propertyNames` metadata alongside `additionalProperties`
// - metadata defined via `meta()` is copied directly to the schema node
// The helpers below normalize these shapes back into Zod validators that the form
// builder can consume.

export function isDiscriminatedUnionSchema(schema: any): boolean {
  if (!schema?.anyOf || !Array.isArray(schema.anyOf) || schema.anyOf.length === 0) {
    return false;
  }

  const firstVariant = schema.anyOf[0];
  if (!firstVariant?.properties) {
    return false;
  }

  return Object.entries(firstVariant.properties).some(([key, prop]: [string, any]) => {
    if (prop?.const === undefined) {
      return false;
    }

    return schema.anyOf.every(
      (variant: any) => variant?.properties?.[key]?.const !== undefined,
    );
  });
}

function getTupleItemsFromSchema(jsonSchema: any): any[] {
  if (Array.isArray(jsonSchema?.prefixItems)) {
    return jsonSchema.prefixItems;
  }

  return [];
}

const WRAPPER_METADATA_KEYS = [
  "title",
  "description",
  "category",
  "hidden",
  "readOnly",
  "deprecated",
  "examples",
  "metadata",
  "ui",
  "placeholder",
  "default",
];

function isPlainObject(value: any): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeWrapperMetadata(wrapper: any, variant: any): any {
  let merged = variant;
  let mutated = false;
  const ensureClone = () => {
    if (!mutated) {
      merged = { ...merged };
      mutated = true;
    }
  };

  WRAPPER_METADATA_KEYS.forEach((key) => {
    if (wrapper?.[key] === undefined) {
      return;
    }

    if (key === "metadata") {
      const wrapperMeta = isPlainObject(wrapper.metadata)
        ? wrapper.metadata
        : {};
      const variantMeta = isPlainObject(variant.metadata)
        ? variant.metadata
        : {};

      const combinedMeta = { ...variantMeta, ...wrapperMeta };
      if (combinedMeta !== variant.metadata) {
        ensureClone();
        merged.metadata = combinedMeta;
      }
      return;
    }

    if (merged[key] !== wrapper[key]) {
      ensureClone();
      merged[key] = wrapper[key];
    }
  });

  return merged;
}

function mergeRequiredMaps(
  target: Record<string, string[]>,
  source?: Record<string, string[]>,
): void {
  if (!source) {
    return;
  }

  Object.entries(source).forEach(([path, keys]) => {
    if (!Array.isArray(keys) || keys.length === 0) {
      return;
    }

    if (!Array.isArray(target[path])) {
      target[path] = [...keys];
      return;
    }

    const mergedKeys = new Set(target[path]);
    keys.forEach((key) => mergedKeys.add(key));
    target[path] = Array.from(mergedKeys);
  });
}

function mergeDefaults(base: any, addition: any): any {
  if (addition === undefined) {
    return base;
  }

  if (base === undefined) {
    return addition;
  }

  if (isPlainObject(base) && isPlainObject(addition)) {
    const result: Record<string, any> = { ...base };
    Object.entries(addition).forEach(([key, value]) => {
      result[key] = mergeDefaults(result[key], value);
    });
    return result;
  }

  if (Array.isArray(base) && Array.isArray(addition)) {
    return addition.length > 0 ? addition : base;
  }

  return addition;
}

export function normalizeNativeSchemaNode(schema: any): any {
  if (!isPlainObject(schema)) {
    return schema;
  }

  let normalized = schema;
  let mutated = false;
  const ensureClone = () => {
    if (!mutated) {
      normalized = { ...normalized };
      mutated = true;
    }
  };

  if (schema.type === "array" && schema.items) {
    const normalizedItems = normalizeNativeSchemaNode(schema.items);
    if (normalizedItems !== schema.items) {
      ensureClone();
      normalized.items = normalizedItems;
    }
  }

  if (schema.type === "array" && Array.isArray(schema.prefixItems)) {
    const normalizedPrefix = schema.prefixItems.map((item: any) =>
      normalizeNativeSchemaNode(item),
    );
    const prefixChanged = normalizedPrefix.some(
      (item, index) => item !== schema.prefixItems[index],
    );

    if (prefixChanged) {
      ensureClone();
      normalized.prefixItems = normalizedPrefix;
    }
  }

  if (schema.type === "object" && isPlainObject(schema.additionalProperties)) {
    const normalizedAdditional = normalizeNativeSchemaNode(
      schema.additionalProperties,
    );

    if (normalizedAdditional !== schema.additionalProperties) {
      ensureClone();
      normalized.additionalProperties = normalizedAdditional;
    }
  }

  if (schema.type === "object" && isPlainObject(schema.propertyNames)) {
    const normalizedPropertyNames = normalizeNativeSchemaNode(
      schema.propertyNames,
    );

    if (normalizedPropertyNames !== schema.propertyNames) {
      ensureClone();
      normalized.propertyNames = normalizedPropertyNames;
    }
  }

  if (schema.type === "object" && isPlainObject(schema.properties)) {
    const normalizedProperties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [
        key,
        normalizeNativeSchemaNode(value),
      ]),
    );

    const propertiesChanged = Object.entries(normalizedProperties).some(
      ([key, value]) => value !== schema.properties[key],
    );

    if (propertiesChanged) {
      ensureClone();
      normalized.properties = normalizedProperties;
    }
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const normalizedVariants = schema.anyOf.map((variant: any) =>
      normalizeNativeSchemaNode(variant),
    );
    const variantsChanged = normalizedVariants.some(
      (variant, index) => variant !== schema.anyOf[index],
    );

    const schemaForCheck = variantsChanged
      ? { ...normalized, anyOf: normalizedVariants }
      : normalized;

    if (!isDiscriminatedUnionSchema(schemaForCheck)) {
      const nonNullVariants = normalizedVariants.filter(
        (variant: any) => variant?.type !== "null",
      );
      const hasNullVariant = nonNullVariants.length !== normalizedVariants.length;

      if (hasNullVariant && nonNullVariants.length === 1) {
        const mergedVariant = mergeWrapperMetadata(
          schemaForCheck,
          nonNullVariants[0],
        );
        return {
          ...mergedVariant,
          nullable: true,
        };
      }
    }

    if (variantsChanged) {
      ensureClone();
      normalized.anyOf = normalizedVariants;
    }
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const normalizedAllOf = schema.allOf.map((variant: any) =>
      normalizeNativeSchemaNode(variant),
    );
    const allOfChanged = normalizedAllOf.some(
      (variant, index) => variant !== schema.allOf[index],
    );

    const objectVariants = normalizedAllOf.filter(
      (variant: any) =>
        variant?.type === "object" && isPlainObject(variant.properties),
    );

    if (
      objectVariants.length > 0 &&
      objectVariants.length === normalizedAllOf.length
    ) {
      ensureClone();
      normalized.type = "object";
      const mergedProperties: Record<string, any> = {
        ...(normalized.properties || {}),
      };
      objectVariants.forEach((variant: any) => {
        Object.entries(variant.properties).forEach(([key, value]) => {
          mergedProperties[key] = value;
        });
      });
      normalized.properties = mergedProperties;

      const mergedRequired = new Set<string>(
        Array.isArray(normalized.required) ? normalized.required : [],
      );
      objectVariants.forEach((variant: any) => {
        (variant.required || []).forEach((key: string) =>
          mergedRequired.add(key),
        );
      });
      normalized.required = Array.from(mergedRequired);

      if (
        objectVariants.every(
          (variant: any) => variant.additionalProperties === false,
        )
      ) {
        normalized.additionalProperties = false;
      }

      delete normalized.allOf;
      return normalized;
    }

    if (allOfChanged) {
      ensureClone();
      normalized.allOf = normalizedAllOf;
    }
  }

  return normalized;
}

function buildUnionSchema(jsonSchema: any, path = ""): SchemaResult {
  const normalizedSchema = normalizeNativeSchemaNode(jsonSchema);

  if (
    !Array.isArray(normalizedSchema?.anyOf) ||
    normalizedSchema.anyOf.length === 0
  ) {
    return {
      schema: z.any(),
      defaults: undefined,
      required: {},
    };
  }

  const variantSchemas: z.ZodTypeAny[] = [];
  const required: Record<string, string[]> = {};

  normalizedSchema.anyOf.forEach((variant: any, index: number) => {
    if (!variant) {
      return;
    }

    const normalizedVariant = normalizeNativeSchemaNode(variant);

    if (normalizedVariant.type === "object" && normalizedVariant.properties) {
      const {
        schema: nestedSchema,
        required: nestedRequired,
      } = buildSchemaAndDefaults(normalizedVariant, `${path}[${index}]`);
      variantSchemas.push(nestedSchema);
      mergeRequiredMaps(required, nestedRequired);
    } else if (
      normalizedVariant.type === "array" &&
      getTupleItemsFromSchema(normalizedVariant).length
    ) {
      const { schema: tupleSchema, required: tupleRequired } = buildTupleSchema(
        normalizedVariant,
        `${path}[${index}]`,
      );
      variantSchemas.push(tupleSchema);
      mergeRequiredMaps(required, tupleRequired);
    } else if (
      normalizedVariant.type === "array" &&
      normalizedVariant.items
    ) {
      const { schema: itemSchema } = buildArraySchema(
        normalizedVariant.items,
        `${path}[${index}][]`,
      );
      let arraySchema = z.array(itemSchema);
      if (normalizedVariant.minItems !== undefined) {
        arraySchema = arraySchema.min(normalizedVariant.minItems, {
          message: `Must have at least ${normalizedVariant.minItems} items`,
        });
      }
      if (normalizedVariant.maxItems !== undefined) {
        arraySchema = arraySchema.max(normalizedVariant.maxItems, {
          message: `Must have at most ${normalizedVariant.maxItems} items`,
        });
      }
      variantSchemas.push(arraySchema);
    } else if (
      Array.isArray(normalizedVariant.enum) &&
      normalizedVariant.enum.length > 0
    ) {
      const { schema: enumSchema } = buildNativeEnumSchema(
        normalizedVariant,
        true,
      );
      variantSchemas.push(enumSchema);
    } else {
      const { schema: primitiveSchema } = buildFieldSchema(
        normalizedVariant,
        true,
        `${path}[${index}]`,
      );
      variantSchemas.push(primitiveSchema);
    }
  });

  if (variantSchemas.length === 0) {
    return {
      schema: z.any(),
      defaults: undefined,
      required,
    };
  }

  const [firstSchema, ...remainingSchemas] = variantSchemas;
  let unionSchema: z.ZodTypeAny = firstSchema!;
  remainingSchemas.forEach((schema) => {
    unionSchema = z.union([unionSchema, schema]);
  });

  if (normalizedSchema.default !== undefined) {
    unionSchema = unionSchema.default(normalizedSchema.default);
  }

  return {
    schema: unionSchema,
    defaults: normalizedSchema.default,
    required,
  };
}

function buildAllOfSchema(jsonSchema: any, path = ""): SchemaResult {
  const schemaNode = normalizeNativeSchemaNode(jsonSchema);
  if (!Array.isArray(schemaNode?.allOf) || schemaNode.allOf.length === 0) {
    return {
      schema: z.any(),
      defaults: undefined,
      required: {},
    };
  }

  let mergedSchema: z.ZodTypeAny | null = null;
  let mergedDefaults: any = undefined;
  const required: Record<string, string[]> = {};

  schemaNode.allOf.forEach((variant: any, index: number) => {
    if (!variant) {
      return;
    }

    const { schema, defaults, required: variantRequired } =
      buildSchemaAndDefaults(variant, path);

    if (!mergedSchema) {
      mergedSchema = schema;
      mergedDefaults = defaults;
    } else {
      mergedSchema = z.intersection(mergedSchema, schema);
      mergedDefaults = mergeDefaults(mergedDefaults, defaults);
    }

    mergeRequiredMaps(required, variantRequired);
  });

  if (!mergedSchema) {
    return {
      schema: z.any(),
      defaults: undefined,
      required: {},
    };
  }

  if (schemaNode.default !== undefined) {
    mergedSchema = (mergedSchema as z.ZodTypeAny).default(schemaNode.default);
    mergedDefaults = schemaNode.default;
  }

  return {
    schema: mergedSchema,
    defaults: mergedDefaults,
    required,
  };
}

// Recursively build zod schema and default values
export function buildSchemaAndDefaults(
  jsonSchema: any,
  path = "",
): SchemaResult {
  const schemaNode = normalizeNativeSchemaNode(jsonSchema);

  if (!schemaNode) {
    return {
      schema: z.any(),
      defaults: undefined,
      required: {},
    };
  }

  if (Array.isArray(schemaNode.allOf) && schemaNode.allOf.length > 0) {
    return buildAllOfSchema(schemaNode, path);
  }

  if (schemaNode.anyOf) {
    if (isDiscriminatedUnionSchema(schemaNode)) {
      return buildDiscriminatedUnionSchema(schemaNode, path);
    }
    return buildUnionSchema(schemaNode, path);
  }

  // Handle tuples (array with prefixItems or items array)
  if (
    schemaNode.type === "array" &&
    getTupleItemsFromSchema(schemaNode).length
  ) {
    return buildTupleSchema(schemaNode, path);
  }

  // Handle records (object with additionalProperties)
  if (
    schemaNode.type === "object" &&
    !schemaNode.properties &&
    schemaNode.additionalProperties
  ) {
    return buildRecordSchema(schemaNode, path);
  }

  // Handle enums encoded via JSON Schema enum arrays
  if (Array.isArray(schemaNode.enum) && schemaNode.enum.length > 0) {
    return buildNativeEnumSchema(schemaNode, true);
  }

  // Handle root schema or nested object schema
  if (schemaNode.type === "object" && schemaNode.properties) {
    const schemaShape: Record<string, z.ZodTypeAny> = {};
    const defaults: Record<string, any> = {};
    const required: Record<string, string[]> = {};

    // Store required fields for this path
    const requiredKeys = schemaNode.required || [];
    required[path || "root"] = requiredKeys;

    Object.entries(schemaNode.properties).forEach(
      ([key, value]: [string, any]) => {
        const propertyNode = normalizeNativeSchemaNode(value);
        const currentPath = path ? `${path}.${key}` : key;
        const isRequiredField = requiredKeys.includes(key);

        if (propertyNode.anyOf) {
          const unionBuilder = isDiscriminatedUnionSchema(propertyNode)
            ? buildDiscriminatedUnionSchema
            : buildUnionSchema;
          const {
            schema: unionSchema,
            defaults: unionDefaults,
            required: unionRequired,
          } = unionBuilder(propertyNode, currentPath);

          schemaShape[key] = isRequiredField
            ? unionSchema
            : unionSchema.optional();
          defaults[key] = propertyNode.default ?? unionDefaults;

          mergeRequiredMaps(required, unionRequired);
        } else if (propertyNode.type === "object" && propertyNode.properties) {
          // Recursively handle nested objects
          const {
            schema: nestedSchema,
            defaults: nestedDefaults,
            required: nestedRequired,
          } = buildSchemaAndDefaults(propertyNode, currentPath);

          schemaShape[key] = isRequiredField
            ? nestedSchema
            : nestedSchema.optional();
          defaults[key] = propertyNode.default ?? nestedDefaults;

          // Merge nested required fields
          mergeRequiredMaps(required, nestedRequired);
        } else if (
          propertyNode.type === "object" &&
          !propertyNode.properties &&
          propertyNode.additionalProperties
        ) {
          // Handle record types
          const {
            schema: recordSchema,
            defaults: recordDefaults,
            required: recordRequired,
          } = buildRecordSchema(propertyNode, currentPath);

          schemaShape[key] = isRequiredField
            ? recordSchema
            : recordSchema.optional();
          defaults[key] = propertyNode.default ?? recordDefaults;

          // Merge record required fields
          mergeRequiredMaps(required, recordRequired);
        } else if (
          propertyNode.type === "array" &&
          getTupleItemsFromSchema(propertyNode).length
        ) {
          // Handle tuple types
          const {
            schema: tupleSchema,
            defaults: tupleDefaults,
            required: tupleRequired,
          } = buildTupleSchema(propertyNode, currentPath);

          schemaShape[key] = isRequiredField
            ? tupleSchema
            : tupleSchema.optional();
          defaults[key] = propertyNode.default ?? tupleDefaults;

          // Merge tuple required fields
          mergeRequiredMaps(required, tupleRequired);
        } else if (propertyNode.type === "array" && propertyNode.items) {
          // Handle arrays
          const {
            schema: itemSchema,
            defaults: itemDefaults,
            required: itemRequired,
          } = buildArraySchema(propertyNode.items, `${currentPath}[]`);

          let arraySchema = z.array(itemSchema);

          // Apply array constraints
          if (propertyNode.minItems !== undefined) {
            arraySchema = arraySchema.min(propertyNode.minItems, {
              message: `Must have at least ${propertyNode.minItems} items`,
            });
          }

          if (propertyNode.maxItems !== undefined) {
            arraySchema = arraySchema.max(propertyNode.maxItems, {
              message: `Must have at most ${propertyNode.maxItems} items`,
            });
          }

          schemaShape[key] = isRequiredField
            ? arraySchema
            : arraySchema.optional();
          defaults[key] = propertyNode.default ?? [];

          // Merge array item required fields
          mergeRequiredMaps(required, itemRequired);
        } else if (
          Array.isArray(propertyNode.enum) &&
          propertyNode.enum.length > 0
        ) {
          const { schema: enumSchema, defaults: enumDefaults } =
            buildNativeEnumSchema(propertyNode, isRequiredField);
          schemaShape[key] = enumSchema;
          defaults[key] = propertyNode.default ?? enumDefaults;
        } else {
          // Handle primitive types
          const { schema: fieldSchema, defaults: fieldDefault } = buildFieldSchema(
            propertyNode,
            isRequiredField,
            currentPath,
          );

          schemaShape[key] = fieldSchema;
          defaults[key] = fieldDefault;
        }
      },
    );

    const objectSchema = z.object(schemaShape);

    return {
      schema: objectSchema,
      defaults,
      required,
    };
  }

  // Fallback
  const { schema, defaults } = buildFieldSchema(schemaNode, true, path);
  return {
    schema,
    defaults,
    required: {},
  };
}

export function buildNativeEnumSchema(
  jsonSchema: any,
  isRequired = false,
): { schema: z.ZodType<any>; defaults: any; required: {} } {
  const schemaNode = normalizeNativeSchemaNode(jsonSchema);
  const enumValues = Array.isArray(schemaNode.enum) ? schemaNode.enum : [];

  if (!Array.isArray(enumValues) || enumValues.length === 0) {
    return {
      schema: z.any(),
      defaults: undefined,
      required: {},
    };
  }

  let enumSchema: z.ZodTypeAny;
  const allStrings = enumValues.every((value) => typeof value === "string");

  if (allStrings) {
    enumSchema = z.enum(enumValues as [string, ...string[]]);
  } else {
    enumSchema = z.literal(enumValues[0]);
    for (let i = 1; i < enumValues.length; i++) {
      enumSchema = z.union([enumSchema, z.literal(enumValues[i])]);
    }
  }

  if (!isRequired) {
    enumSchema = enumSchema.optional();
  }

  if (schemaNode.default !== undefined) {
    enumSchema = enumSchema.default(schemaNode.default);
  }

  return {
    schema: enumSchema,
    defaults: schemaNode.default ?? enumValues[0],
    required: {},
  };
}

// Build schema for discriminated unions (anyOf)
export function buildDiscriminatedUnionSchema(
  jsonSchema: any,
  path = "",
): SchemaResult {
  const schemaNode = normalizeNativeSchemaNode(jsonSchema);

  if (!schemaNode.anyOf || schemaNode.anyOf.length === 0) {
    return {
      schema: z.any(),
      defaults: undefined,
      required: {},
    };
  }

  // Find the discriminator field by looking for a property with a "const" value in each variant
  const findDiscriminator = () => {
    if (!schemaNode.anyOf[0]?.properties) return null;

    // Look through the first variant's properties to find one with a "const" value
    const firstVariant = schemaNode.anyOf[0].properties;
    for (const [key, prop] of Object.entries(firstVariant)) {
      if ((prop as any).const !== undefined) {
        // Verify this key exists with a const value in all variants
        const allVariantsHaveDiscriminator = schemaNode.anyOf.every(
          (variant: any) =>
            variant.properties?.[key] &&
            variant.properties[key].const !== undefined,
        );

        if (allVariantsHaveDiscriminator) {
          // Check that all discriminator values are unique
          const discriminatorValues = schemaNode.anyOf.map(
            (variant: any) => variant.properties[key].const,
          );
          const uniqueValues = new Set(discriminatorValues);

          if (uniqueValues.size !== discriminatorValues.length) {
            // Find the duplicate values for better error reporting
            const valueCounts: Record<string, number> = {};
            const duplicates: string[] = [];

            discriminatorValues.forEach((value: any) => {
              valueCounts[value] = (valueCounts[value] || 0) + 1;
              if (valueCounts[value] > 1 && !duplicates.includes(value)) {
                duplicates.push(value);
              }
            });

            throw new Error(
              `Discriminator property ${key} has duplicate value(s): ${duplicates.join(", ")}. Each variant must have a unique discriminator value.`,
            );
          }

          return key;
        }
      }
    }
    return null;
  };

  const discriminator = findDiscriminator();

  if (!discriminator) {
    // If no discriminator is found, fall back to a regular union
    // This is a simplified implementation - for a full solution, you'd need to handle regular unions too
    return {
      schema: z.any(),
      defaults: undefined,
      required: {},
    };
  }

  // Build schemas for each variant
  const variants: z.ZodTypeAny[] = [];
  const variantDefaults: Record<string, any> = {};
  const required: Record<string, string[]> = {};

  schemaNode.anyOf.forEach((variant: any, index: number) => {
    // Get the discriminator value for this variant
    const discriminatorValue = variant.properties[discriminator].const;

    if (discriminatorValue === undefined) {
      throw new Error(
        `Discriminator value for key '${discriminator}' is missing in variant ${index}`,
      );
    }

    // Build schema for this variant, but we'll need to modify it to ensure the discriminator is a literal
    const variantPath = `${path}[${index}]`;
    const {
      schema: baseVariantSchema,
      defaults,
      required: variantRequired,
    } = buildSchemaAndDefaults(variant, variantPath);

    // Ensure the schema is a ZodObject
    if (!(baseVariantSchema instanceof z.ZodObject)) {
      throw new Error(`Variant schema at index ${index} is not a ZodObject`);
    }

    // Extract the shape from the base schema
    const shape = (baseVariantSchema as any)._def.shape();

    // Replace the discriminator field with a literal
    shape[discriminator] = z.literal(discriminatorValue);

    // Create a new object schema with the updated shape
    const variantSchema = z.object(shape);

    variants.push(variantSchema);

    // Store the discriminator value and its associated defaults
    variantDefaults[discriminatorValue] = {
      ...defaults,
      [discriminator]: discriminatorValue,
    };

    // Merge required fields
    mergeRequiredMaps(required, variantRequired);
  });

  // Create the discriminated union
  const unionSchema = z.discriminatedUnion(
    discriminator,
    variants as any
  );

  // Use the first variant's defaults as the initial defaults
  const firstVariantDiscriminator =
    schemaNode.anyOf[0].properties[discriminator].const;
  const defaults = variantDefaults[firstVariantDiscriminator] || {};

  return {
    schema: unionSchema,
    defaults,
    required,
  };
}

// Build schema for array items
export function buildArraySchema(itemSchema: any, path = ""): SchemaResult {
  const schemaNode = normalizeNativeSchemaNode(itemSchema);

  if (!schemaNode) {
    return {
      schema: z.any(),
      defaults: undefined,
      required: {},
    };
  }

  if (Array.isArray(schemaNode.allOf) && schemaNode.allOf.length > 0) {
    return buildAllOfSchema(schemaNode, path);
  }

  if (schemaNode.anyOf) {
    const unionBuilder = isDiscriminatedUnionSchema(schemaNode)
      ? buildDiscriminatedUnionSchema
      : buildUnionSchema;
    return unionBuilder(schemaNode, path);
  }

  // Handle array of objects
  if (schemaNode.type === "object" && schemaNode.properties) {
    return buildSchemaAndDefaults(schemaNode, path);
  }

  if (
    schemaNode.type === "object" &&
    !schemaNode.properties &&
    schemaNode.additionalProperties
  ) {
    return buildRecordSchema(schemaNode, path);
  }

  if (
    schemaNode.type === "array" &&
    getTupleItemsFromSchema(schemaNode).length
  ) {
    return buildTupleSchema(schemaNode, path);
  }

  if (schemaNode.type === "array" && schemaNode.items) {
    const nestedPath = path ? `${path}[]` : path;
    const nestedSchema = buildArraySchema(schemaNode.items, nestedPath);
    let arraySchema = z.array(nestedSchema.schema);

    if (schemaNode.minItems !== undefined) {
      arraySchema = arraySchema.min(schemaNode.minItems, {
        message: `Must have at least ${schemaNode.minItems} items`,
      });
    }

    if (schemaNode.maxItems !== undefined) {
      arraySchema = arraySchema.max(schemaNode.maxItems, {
        message: `Must have at most ${schemaNode.maxItems} items`,
      });
    }

    if (schemaNode.default !== undefined) {
      arraySchema = arraySchema.default(schemaNode.default);
    }

    return {
      schema: arraySchema,
      defaults: schemaNode.default ?? [],
      required: nestedSchema.required,
    };
  }

  if (Array.isArray(schemaNode.enum) && schemaNode.enum.length > 0) {
    const { schema, defaults } = buildNativeEnumSchema(schemaNode, true);
    return { schema, defaults, required: {} };
  }

  // Handle array of primitives
  const { schema, defaults } = buildFieldSchema(schemaNode, true, path);
  return {
    schema,
    defaults,
    required: {},
  };
}

// Build schema for tuples (array with prefixItems or items array)
export function buildTupleSchema(jsonSchema: any, path = ""): SchemaResult {
  const tupleNode = normalizeNativeSchemaNode(jsonSchema);
  const tupleDefinitions = getTupleItemsFromSchema(tupleNode);

  if (!tupleDefinitions.length) {
    return {
      schema: z.any(),
      defaults: undefined,
      required: {},
    };
  }

  // Build tuple schema from array items
  const tupleItems: z.ZodTypeAny[] = [];
  const defaults: any[] = [];
  const required: Record<string, string[]> = {};

  // Process each item in the tuple
  tupleDefinitions.forEach((itemSchema: any, index: number) => {
    const normalizedItem = normalizeNativeSchemaNode(itemSchema);
    const itemPath = `${path}.${index}`;

    if (Array.isArray(normalizedItem?.allOf) && normalizedItem.allOf.length) {
      const {
        schema: allOfSchema,
        defaults: allOfDefaults,
        required: allOfRequired,
      } = buildAllOfSchema(normalizedItem, itemPath);
      tupleItems.push(allOfSchema);
      defaults[index] = allOfDefaults;
      mergeRequiredMaps(required, allOfRequired);
    } else if (normalizedItem?.anyOf) {
      const unionBuilder = isDiscriminatedUnionSchema(normalizedItem)
        ? buildDiscriminatedUnionSchema
        : buildUnionSchema;
      const {
        schema: unionSchema,
        defaults: unionDefaults,
        required: unionRequired,
      } = unionBuilder(normalizedItem, itemPath);

      tupleItems.push(unionSchema);
      defaults[index] = normalizedItem.default ?? unionDefaults;
      mergeRequiredMaps(required, unionRequired);
    } else if (
      normalizedItem.type === "object" &&
      normalizedItem.properties
    ) {
      // Handle object items
      const {
        schema: objectSchema,
        defaults: objectDefaults,
        required: objectRequired,
      } = buildSchemaAndDefaults(normalizedItem, itemPath);

      tupleItems.push(objectSchema);
      defaults[index] = objectDefaults;

      // Merge required fields
      mergeRequiredMaps(required, objectRequired);
    } else if (
      normalizedItem.type === "object" &&
      !normalizedItem.properties &&
      normalizedItem.additionalProperties
    ) {
      const {
        schema: recordSchema,
        defaults: recordDefaults,
        required: recordRequired,
      } = buildRecordSchema(normalizedItem, itemPath);

      tupleItems.push(recordSchema);
      defaults[index] = recordDefaults;
      mergeRequiredMaps(required, recordRequired);
    } else if (
      normalizedItem.type === "array" &&
      getTupleItemsFromSchema(normalizedItem).length
    ) {
      const {
        schema: nestedTupleSchema,
        defaults: nestedTupleDefaults,
        required: nestedTupleRequired,
      } = buildTupleSchema(normalizedItem, itemPath);

      tupleItems.push(nestedTupleSchema);
      defaults[index] = nestedTupleDefaults;
      mergeRequiredMaps(required, nestedTupleRequired);
    } else if (normalizedItem.type === "array" && normalizedItem.items) {
      // Handle nested arrays
      const {
        schema: arraySchema,
        defaults: arrayDefaults,
        required: arrayRequired,
      } = buildArraySchema(normalizedItem.items, `${itemPath}[]`);

      let nestedArraySchema = z.array(arraySchema);

      if (normalizedItem.minItems !== undefined) {
        nestedArraySchema = nestedArraySchema.min(normalizedItem.minItems, {
          message: `Must have at least ${normalizedItem.minItems} items`,
        });
      }

      if (normalizedItem.maxItems !== undefined) {
        nestedArraySchema = nestedArraySchema.max(normalizedItem.maxItems, {
          message: `Must have at most ${normalizedItem.maxItems} items`,
        });
      }

      tupleItems.push(nestedArraySchema);
      defaults[index] = normalizedItem.default ?? arrayDefaults ?? [];

      // Merge required fields
      mergeRequiredMaps(required, arrayRequired);
    } else {
      // Handle primitive types
      const { schema: fieldSchema, defaults: fieldDefault } = buildFieldSchema(
        normalizedItem,
        true,
        itemPath,
      );

      tupleItems.push(fieldSchema);
      defaults[index] = fieldDefault;
    }
  });

  // Create the tuple schema
  const tupleSchema = z.tuple(tupleItems as [z.ZodTypeAny, ...z.ZodTypeAny[]]);

  return {
    schema: tupleSchema,
    defaults,
    required,
  };
}

// Build schema for records (object with additionalProperties)
export function buildRecordSchema(jsonSchema: any, path = ""): SchemaResult {
  const schemaNode = normalizeNativeSchemaNode(jsonSchema);

  if (!schemaNode?.additionalProperties) {
    return {
      schema: z.any(),
      defaults: undefined,
      required: {},
    };
  }

  const keyConstraints = schemaNode.propertyNames;
  let keySchema = z.string();

  if (keyConstraints) {
    if (keyConstraints.minLength !== undefined) {
      keySchema = keySchema.min(keyConstraints.minLength, {
        message: `Key must be at least ${keyConstraints.minLength} characters`,
      });
    }

    if (keyConstraints.maxLength !== undefined) {
      keySchema = keySchema.max(keyConstraints.maxLength, {
        message: `Key must be at most ${keyConstraints.maxLength} characters`,
      });
    }

    if (keyConstraints.pattern) {
      keySchema = keySchema.regex(new RegExp(keyConstraints.pattern), {
        message: keyConstraints.patternMessage || "Invalid key format",
      });
    }

    if (Array.isArray(keyConstraints.enum) && keyConstraints.enum.length > 0) {
      const allowedKeys = keyConstraints.enum.filter(
        (value: any): value is string => typeof value === "string",
      );
      if (allowedKeys.length > 0) {
        keySchema = keySchema.refine(
          (value) => allowedKeys.includes(value),
          {
            message: `Key must be one of: ${allowedKeys.join(", ")}`,
          },
        );
      }
    }
  }

  const valuePath = path ? `${path}.*` : path;
  const valueNode = normalizeNativeSchemaNode(schemaNode.additionalProperties);

  let valueSchemaResult: SchemaResult;

  if (!isPlainObject(valueNode)) {
    valueSchemaResult = {
      schema: z.any(),
      defaults: undefined,
      required: {},
    };
  } else if (Array.isArray(valueNode.allOf) && valueNode.allOf.length > 0) {
    valueSchemaResult = buildAllOfSchema(valueNode, valuePath);
  } else if (valueNode.anyOf) {
    valueSchemaResult = isDiscriminatedUnionSchema(valueNode)
      ? buildDiscriminatedUnionSchema(valueNode, valuePath)
      : buildUnionSchema(valueNode, valuePath);
  } else if (valueNode.type === "object" && valueNode.properties) {
    valueSchemaResult = buildSchemaAndDefaults(valueNode, valuePath);
  } else if (
    valueNode.type === "object" &&
    !valueNode.properties &&
    valueNode.additionalProperties
  ) {
    valueSchemaResult = buildRecordSchema(valueNode, valuePath);
  } else if (
    valueNode.type === "array" &&
    getTupleItemsFromSchema(valueNode).length
  ) {
    valueSchemaResult = buildTupleSchema(valueNode, valuePath);
  } else if (valueNode.type === "array" && valueNode.items) {
    const nestedItems = buildArraySchema(valueNode.items, `${valuePath}[]`);
    let nestedArraySchema = z.array(nestedItems.schema);

    if (valueNode.minItems !== undefined) {
      nestedArraySchema = nestedArraySchema.min(valueNode.minItems, {
        message: `Must have at least ${valueNode.minItems} entries`,
      });
    }

    if (valueNode.maxItems !== undefined) {
      nestedArraySchema = nestedArraySchema.max(valueNode.maxItems, {
        message: `Must have at most ${valueNode.maxItems} entries`,
      });
    }

    if (valueNode.default !== undefined) {
      nestedArraySchema = nestedArraySchema.default(valueNode.default);
    }

    valueSchemaResult = {
      schema: nestedArraySchema,
      defaults: valueNode.default ?? nestedItems.defaults ?? [],
      required: nestedItems.required,
    };
  } else if (Array.isArray(valueNode.enum) && valueNode.enum.length > 0) {
    valueSchemaResult = buildNativeEnumSchema(valueNode, true);
  } else {
    const fieldResult = buildFieldSchema(valueNode, true, valuePath);
    valueSchemaResult = {
      schema: fieldResult.schema,
      defaults: fieldResult.defaults,
      required: {},
    };
  }

  const recordSchema = z.record(keySchema, valueSchemaResult.schema);

  return {
    schema: recordSchema,
    defaults: schemaNode.default || {},
    required: valueSchemaResult.required,
  };
}

// Build schema for a specific field
export function buildFieldSchema(
  property: any,
  isRequired = false,
  path = "",
): { schema: z.ZodTypeAny; defaults: any } {
  const schemaNode = normalizeNativeSchemaNode(property);

  if (!schemaNode) {
    return { schema: z.any(), defaults: undefined };
  }

  if (Array.isArray(schemaNode.allOf) && schemaNode.allOf.length > 0) {
    const { schema, defaults } = buildAllOfSchema(schemaNode, path);
    return {
      schema: isRequired ? schema : schema.optional(),
      defaults,
    };
  }

  if (schemaNode.anyOf) {
    const unionBuilder = isDiscriminatedUnionSchema(schemaNode)
      ? buildDiscriminatedUnionSchema
      : buildUnionSchema;
    const { schema, defaults } = unionBuilder(schemaNode, path);
    return {
      schema: isRequired ? schema : schema.optional(),
      defaults,
    };
  }

  if (Array.isArray(schemaNode.enum) && schemaNode.enum.length > 0) {
    const { schema, defaults } = buildNativeEnumSchema(
      schemaNode,
      isRequired,
    );
    return { schema, defaults };
  }

  if (schemaNode.const !== undefined) {
    let literalSchema: z.ZodTypeAny = z.literal(schemaNode.const);
    if (!isRequired) {
      literalSchema = literalSchema.optional();
    }
    if (schemaNode.default !== undefined) {
      literalSchema = literalSchema.default(schemaNode.default);
    }
    return {
      schema: literalSchema,
      defaults: schemaNode.default ?? schemaNode.const,
    };
  }

  let fieldSchema: z.ZodTypeAny;
  const fallbackDefault = getDefaultValueForType(schemaNode);
  let fieldDefault = fallbackDefault;

  // Handle different types
  switch (schemaNode.type) {
    case "string":
      // Handle string formats
      if (schemaNode.format === "date-time" || schemaNode.format === "date") {
        fieldSchema = z.date();
        fieldDefault = schemaNode.default ? new Date(schemaNode.default) : null;
      } else if (schemaNode.format === "email") {
        fieldSchema = z.string().email({ message: "Invalid email address" });
        fieldDefault = schemaNode.default || "";
      } else if (
        schemaNode.format === "uri" ||
        schemaNode.format === "url"
      ) {
        fieldSchema = z.string().url({ message: "Invalid URL" });
        fieldDefault = schemaNode.default || "";
      } else if (schemaNode.pattern) {
        fieldSchema = z.string().regex(new RegExp(schemaNode.pattern), {
          message: schemaNode.patternMessage || "Invalid format",
        });
        fieldDefault = schemaNode.default || "";
      } else {
        // Regular string with potential constraints
        let stringSchema = z.string();

        if (schemaNode.minLength !== undefined) {
          stringSchema = stringSchema.min(schemaNode.minLength, {
            message: `Must be at least ${schemaNode.minLength} characters`,
          });
        }

        if (schemaNode.maxLength !== undefined) {
          stringSchema = stringSchema.max(schemaNode.maxLength, {
            message: `Must be at most ${schemaNode.maxLength} characters`,
          });
        }

        fieldSchema = stringSchema;
        fieldDefault = schemaNode.default || "";
      }
      break;

    case "number":
    case "integer":
      let numberSchema: z.ZodTypeAny =
        schemaNode.type === "integer" ? z.number().int() : z.number();

      if (schemaNode.minimum !== undefined) {
        numberSchema = (numberSchema as z.ZodNumber).min(schemaNode.minimum, {
          message: `Must be at least ${schemaNode.minimum}`,
        });
      }

      if (schemaNode.maximum !== undefined) {
        numberSchema = (numberSchema as z.ZodNumber).max(schemaNode.maximum, {
          message: `Must be at most ${schemaNode.maximum}`,
        });
      }

      if (schemaNode.multipleOf !== undefined) {
        numberSchema = numberSchema.refine(
          (val) => (val as number) % schemaNode.multipleOf === 0,
          {
            message: `Must be a multiple of ${schemaNode.multipleOf}`,
          },
        );
      }

      fieldSchema = numberSchema;
      fieldDefault =
        schemaNode.default !== undefined ? schemaNode.default : 0;
      break;

    case "boolean":
      fieldSchema = z.boolean();
      fieldDefault =
        schemaNode.default !== undefined ? schemaNode.default : false;
      break;

    case "null":
      fieldSchema = z.null();
      fieldDefault = null;
      break;

    default:
      // Handle any other types or unknown types
      fieldSchema = z.any();
      fieldDefault =
        schemaNode.default !== undefined ? schemaNode.default : null;
  }

  // Handle nullable fields (normalized nodes get an explicit nullable flag)
  if (schemaNode.nullable === true) {
    fieldSchema = fieldSchema.nullable();
    if (schemaNode.default === undefined) {
      fieldDefault = null;
    }
  }

  // Make field optional if not required
  if (!isRequired) {
    fieldSchema = fieldSchema.optional();
  } else {
    // For required fields, add validation message
    if (fieldSchema instanceof z.ZodString) {
      fieldSchema = fieldSchema.min(1, { message: "This field is required" });
    }
  }

  // Apply default value if specified
  if (schemaNode.default !== undefined) {
    fieldSchema = fieldSchema.default(schemaNode.default);
  }

  if (fieldDefault === undefined) {
    fieldDefault = fallbackDefault;
  }

  return { schema: fieldSchema, defaults: fieldDefault };
}

// Helper function to create default item for arrays
export function createDefaultItem(itemSchema: any): any {
  const schemaNode = normalizeNativeSchemaNode(itemSchema);

  if (!schemaNode) return "";

  if (schemaNode.default !== undefined) {
    return schemaNode.default;
  }

  if (Array.isArray(schemaNode.allOf) && schemaNode.allOf.length > 0) {
    const { defaults } = buildAllOfSchema(schemaNode);
    if (defaults !== undefined) {
      return defaults;
    }
  }

  if (schemaNode.type === "object" && schemaNode.properties) {
    const result: Record<string, any> = {};
    Object.entries(schemaNode.properties).forEach(
      ([key, value]: [string, any]) => {
        result[key] = createDefaultItem(value);
      },
    );
    return result;
  }

  if (
    schemaNode.type === "object" &&
    !schemaNode.properties &&
    schemaNode.additionalProperties
  ) {
    return {};
  }

  if (schemaNode.type === "array") {
    return [];
  }

  return getDefaultValueForType(schemaNode);
}

// Get default value based on type
export function getDefaultValueForType(schema: any): any {
  const schemaNode = normalizeNativeSchemaNode(schema);

  if (!schemaNode) return "";

  if (schemaNode.default !== undefined) {
    return schemaNode.default;
  }

  if (schemaNode.const !== undefined) {
    return schemaNode.const;
  }

  if (schemaNode.nullable) {
    return null;
  }

  if (Array.isArray(schemaNode.enum) && schemaNode.enum.length > 0) {
    return schemaNode.enum[0];
  }

  if (Array.isArray(schemaNode.anyOf) && schemaNode.anyOf.length > 0) {
    const nonNullVariant = schemaNode.anyOf.find(
      (variant: any) => variant?.type !== "null",
    );
    if (nonNullVariant) {
      return getDefaultValueForType(nonNullVariant);
    }
    return getDefaultValueForType(schemaNode.anyOf[0]);
  }

  if (Array.isArray(schemaNode.allOf) && schemaNode.allOf.length > 0) {
    let combinedDefault: any = undefined;
    schemaNode.allOf.forEach((variant: any) => {
      const variantDefault = getDefaultValueForType(variant);
      combinedDefault = mergeDefaults(combinedDefault, variantDefault);
    });
    if (combinedDefault !== undefined) {
      return combinedDefault;
    }
  }

  switch (schemaNode.type) {
    case "string":
      return "";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      if (schemaNode.properties) {
        const result: Record<string, any> = {};
        Object.entries(schemaNode.properties).forEach(
          ([key, value]: [string, any]) => {
            result[key] = getDefaultValueForType(value);
          },
        );
        return result;
      }
      return {};
    default:
      return null;
  }
}

export function getSchemaMeta(property: any) {
  const schemaNode = normalizeNativeSchemaNode(property);
  const metadata = isPlainObject(schemaNode?.metadata)
    ? schemaNode.metadata
    : {};
  return {
    category: schemaNode?.category ?? metadata.category ?? "",
    hidden: schemaNode?.hidden ?? metadata.hidden ?? false,
    readOnly: schemaNode?.readOnly ?? metadata.readOnly ?? false,
  };
}

export function getSchemaCategory(property: any): string {
  return getSchemaMeta(property).category || "";
}
