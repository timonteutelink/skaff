import * as z from "zod";
import type { SchemaResult } from "./types";

// Recursively build zod schema and default values
export function buildSchemaAndDefaults(
  jsonSchema: any,
  path = "",
): SchemaResult {
  if (!jsonSchema) {
    return {
      schema: z.any(),
      defaults: undefined,
      required: {},
    };
  }

  // Handle discriminated unions (anyOf)
  if (jsonSchema.anyOf) {
    return buildDiscriminatedUnionSchema(jsonSchema, path);
  }

  // Handle tuples (array with prefixItems or items array)
  if (jsonSchema.type === "array" && Array.isArray(jsonSchema.items)) {
    return buildTupleSchema(jsonSchema, path);
  }

  // Handle records (object with additionalProperties)
  if (
    jsonSchema.type === "object" &&
    !jsonSchema.properties &&
    jsonSchema.additionalProperties
  ) {
    return buildRecordSchema(jsonSchema, path);
  }

  // Handle native enums
  if (jsonSchema.type === "enum" && Array.isArray(jsonSchema.values)) {
    return buildNativeEnumSchema(jsonSchema);
  }

  // Handle root schema or nested object schema
  if (jsonSchema.type === "object" && jsonSchema.properties) {
    const schemaShape: Record<string, z.ZodTypeAny> = {};
    const defaults: Record<string, any> = {};
    const required: Record<string, string[]> = {};

    // Store required fields for this path
    required[path || "root"] = jsonSchema.required || [];

    // If pick is specified, filter properties to only include those
    const propertiesToProcess = jsonSchema.pick
      ? Object.fromEntries(
        Object.entries(jsonSchema.properties).filter(([key]) =>
          jsonSchema.pick.includes(key),
        ),
      )
      : // If omit is specified, filter properties to exclude those
      jsonSchema.omit
        ? Object.fromEntries(
          Object.entries(jsonSchema.properties).filter(
            ([key]) => !jsonSchema.omit.includes(key),
          ),
        )
        : jsonSchema.properties;

    Object.entries(propertiesToProcess).forEach(
      ([key, value]: [string, any]) => {
        const currentPath = path ? `${path}.${key}` : key;
        const isRequiredField = (jsonSchema.required || []).includes(key);

        if (value.anyOf) {
          // Handle nested discriminated unions
          const {
            schema: unionSchema,
            defaults: unionDefaults,
            required: unionRequired,
          } = buildDiscriminatedUnionSchema(value, currentPath);

          schemaShape[key] = isRequiredField
            ? unionSchema
            : unionSchema.optional();
          defaults[key] = value.default || unionDefaults;

          // Merge nested required fields
          Object.assign(required, unionRequired);
        } else if (value.type === "object" && value.properties) {
          // Recursively handle nested objects
          const {
            schema: nestedSchema,
            defaults: nestedDefaults,
            required: nestedRequired,
          } = buildSchemaAndDefaults(value, currentPath);

          schemaShape[key] = isRequiredField
            ? nestedSchema
            : nestedSchema.optional();
          defaults[key] = value.default || nestedDefaults;

          // Merge nested required fields
          Object.assign(required, nestedRequired);
        } else if (
          value.type === "object" &&
          !value.properties &&
          value.additionalProperties
        ) {
          // Handle record types
          const {
            schema: recordSchema,
            defaults: recordDefaults,
            required: recordRequired,
          } = buildRecordSchema(value, currentPath);

          schemaShape[key] = isRequiredField
            ? recordSchema
            : recordSchema.optional();
          defaults[key] = value.default || recordDefaults;

          // Merge record required fields
          Object.assign(required, recordRequired);
        } else if (value.type === "array" && Array.isArray(value.items)) {
          // Handle tuple types
          const {
            schema: tupleSchema,
            defaults: tupleDefaults,
            required: tupleRequired,
          } = buildTupleSchema(value, currentPath);

          schemaShape[key] = isRequiredField
            ? tupleSchema
            : tupleSchema.optional();
          defaults[key] = value.default || tupleDefaults;

          // Merge tuple required fields
          Object.assign(required, tupleRequired);
        } else if (value.type === "array" && value.items) {
          // Handle arrays
          const {
            schema: itemSchema,
            defaults: itemDefaults,
            required: itemRequired,
          } = buildArraySchema(value.items, `${currentPath}[]`);

          let arraySchema = z.array(itemSchema);

          // Apply array constraints
          if (value.minItems !== undefined) {
            arraySchema = arraySchema.min(value.minItems, {
              message: `Must have at least ${value.minItems} items`,
            });
          }

          if (value.maxItems !== undefined) {
            arraySchema = arraySchema.max(value.maxItems, {
              message: `Must have at most ${value.maxItems} items`,
            });
          }

          schemaShape[key] = isRequiredField
            ? arraySchema
            : arraySchema.optional();
          defaults[key] = value.default || [];

          // Merge array item required fields
          Object.assign(required, itemRequired);
        } else if (value.type === "enum" && Array.isArray(value.values)) {
          // Handle native enums
          const { schema: enumSchema, defaults: enumDefaults } =
            buildNativeEnumSchema(value);
          schemaShape[key] = isRequiredField
            ? enumSchema
            : enumSchema.optional();
          defaults[key] = value.default || enumDefaults;
        } else {
          // Handle primitive types
          const { schema: fieldSchema, defaults: fieldDefault } =
            buildFieldSchema(value, isRequiredField);

          schemaShape[key] = fieldSchema;
          defaults[key] = fieldDefault;
        }
      },
    );

    // Create the object schema
    let objectSchema = z.object(schemaShape);

    // Apply partial if specified
    if (jsonSchema.partial === true) {
      objectSchema = objectSchema.partial();
    }

    return {
      schema: objectSchema,
      defaults,
      required,
    };
  }

  // Fallback
  return {
    schema: z.any(),
    defaults: undefined,
    required: {},
  };
}

export function buildNativeEnumSchema(jsonSchema: any): {
  schema: z.ZodType<any>;
  defaults: any;
  required: {};
} {
  if (!jsonSchema.values || !Array.isArray(jsonSchema.values)) {
    return {
      schema: z.any(),
      defaults: undefined,
      required: {},
    };
  }

  // Create an enum-like object from the values
  const enumObj: Record<string, string> = {};
  jsonSchema.values.forEach((value: string | number) => {
    enumObj[value.toString()] = value.toString();
  });

  // Create the enum schema
  const enumSchema = z.nativeEnum(enumObj);

  // Apply default if specified
  const schema =
    jsonSchema.default !== undefined
      ? enumSchema.default(jsonSchema.default)
      : enumSchema;

  return {
    schema,
    defaults: jsonSchema.default || jsonSchema.values[0],
    required: {},
  };
}

// Build schema for discriminated unions (anyOf)
export function buildDiscriminatedUnionSchema(
  jsonSchema: any,
  path = "",
): SchemaResult {
  if (!jsonSchema.anyOf || jsonSchema.anyOf.length === 0) {
    return {
      schema: z.any(),
      defaults: undefined,
      required: {},
    };
  }

  // Find the discriminator field by looking for a property with a "const" value in each variant
  const findDiscriminator = () => {
    if (!jsonSchema.anyOf[0]?.properties) return null;

    // Look through the first variant's properties to find one with a "const" value
    const firstVariant = jsonSchema.anyOf[0].properties;
    for (const [key, prop] of Object.entries(firstVariant)) {
      if ((prop as any).const !== undefined) {
        // Verify this key exists with a const value in all variants
        const allVariantsHaveDiscriminator = jsonSchema.anyOf.every(
          (variant: any) =>
            variant.properties?.[key] &&
            variant.properties[key].const !== undefined,
        );

        if (allVariantsHaveDiscriminator) {
          // Check that all discriminator values are unique
          const discriminatorValues = jsonSchema.anyOf.map(
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

  jsonSchema.anyOf.forEach((variant: any, index: number) => {
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
    Object.assign(required, variantRequired);
  });

  // Create the discriminated union
  const unionSchema = z.discriminatedUnion(
    discriminator,
    variants as any
  );

  // Use the first variant's defaults as the initial defaults
  const firstVariantDiscriminator =
    jsonSchema.anyOf[0].properties[discriminator].const;
  const defaults = variantDefaults[firstVariantDiscriminator] || {};

  return {
    schema: unionSchema,
    defaults,
    required,
  };
}

// Build schema for array items
export function buildArraySchema(itemSchema: any, path = ""): SchemaResult {
  if (!itemSchema) {
    return {
      schema: z.any(),
      defaults: undefined,
      required: {},
    };
  }
  if (itemSchema.anyOf) {
    // buildSchemaAndDefaults will call buildDiscriminatedUnionSchema under the hood
    return buildSchemaAndDefaults(itemSchema, path);
  }

  // Handle array of objects
  if (itemSchema.type === "object" && itemSchema.properties) {
    return buildSchemaAndDefaults(itemSchema, path);
  }

  // Handle array of primitives
  const { schema, defaults } = buildFieldSchema(itemSchema, false);
  return {
    schema,
    defaults,
    required: {},
  };
}

// Build schema for tuples (array with prefixItems or items array)
export function buildTupleSchema(jsonSchema: any, path = ""): SchemaResult {
  if (!jsonSchema.items || !Array.isArray(jsonSchema.items)) {
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
  jsonSchema.items.forEach((itemSchema: any, index: number) => {
    const itemPath = `${path}.${index}`;

    if (itemSchema.type === "object" && itemSchema.properties) {
      // Handle object items
      const {
        schema: objectSchema,
        defaults: objectDefaults,
        required: objectRequired,
      } = buildSchemaAndDefaults(itemSchema, itemPath);

      tupleItems.push(objectSchema);
      defaults[index] = objectDefaults;

      // Merge required fields
      Object.assign(required, objectRequired);
    } else if (itemSchema.type === "array") {
      // Handle nested arrays
      const {
        schema: arraySchema,
        defaults: arrayDefaults,
        required: arrayRequired,
      } = buildArraySchema(itemSchema.items, `${itemPath}[]`);

      tupleItems.push(z.array(arraySchema));
      defaults[index] = arrayDefaults || [];

      // Merge required fields
      Object.assign(required, arrayRequired);
    } else {
      // Handle primitive types
      const { schema: fieldSchema, defaults: fieldDefault } = buildFieldSchema(
        itemSchema,
        true,
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
  if (!jsonSchema.additionalProperties) {
    return {
      schema: z.any(),
      defaults: undefined,
      required: {},
    };
  }

  // Build the value schema
  const { schema: valueSchema } = buildFieldSchema(
    jsonSchema.additionalProperties,
    false,
  );

  // Create the record schema
  const recordSchema = z.record(z.string(), valueSchema);

  return {
    schema: recordSchema,
    defaults: jsonSchema.default || {},
    required: {},
  };
}

// Build schema for a specific field
export function buildFieldSchema(
  property: any,
  isRequired = false,
): { schema: z.ZodTypeAny; defaults: any } {
  let fieldSchema: z.ZodTypeAny;
  let fieldDefault: any;

  // Handle different types
  switch (property.type) {
    case "string":
      // Handle string formats
      if (property.format === "date-time" || property.format === "date") {
        fieldSchema = z.date();
        fieldDefault = property.default ? new Date(property.default) : null;
      } else if (property.format === "email") {
        fieldSchema = z.string().email({ message: "Invalid email address" });
        fieldDefault = property.default || "";
      } else if (property.format === "uri" || property.format === "url") {
        fieldSchema = z.string().url({ message: "Invalid URL" });
        fieldDefault = property.default || "";
      } else if (property.enum) {
        fieldSchema = z.enum(property.enum as [string, ...string[]]);
        fieldDefault = property.default || property.enum[0];
      } else {
        // Regular string with potential constraints
        let stringSchema = z.string();

        if (property.minLength !== undefined) {
          stringSchema = stringSchema.min(property.minLength, {
            message: `Must be at least ${property.minLength} characters`,
          });
        }

        if (property.maxLength !== undefined) {
          stringSchema = stringSchema.max(property.maxLength, {
            message: `Must be at most ${property.maxLength} characters`,
          });
        }

        if (property.pattern) {
          stringSchema = stringSchema.regex(new RegExp(property.pattern), {
            message: property.patternMessage || "Invalid format",
          });
        }

        fieldSchema = stringSchema;
        fieldDefault = property.default || "";
      }
      break;

    case "number":
    case "integer":
      let numberSchema: z.ZodTypeAny =
        property.type === "integer" ? z.number().int() : z.number();

      if (property.minimum !== undefined) {
        numberSchema = (numberSchema as z.ZodNumber).min(property.minimum, {
          message: `Must be at least ${property.minimum}`,
        });
      }

      if (property.maximum !== undefined) {
        numberSchema = (numberSchema as z.ZodNumber).max(property.maximum, {
          message: `Must be at most ${property.maximum}`,
        });
      }

      if (property.multipleOf !== undefined) {
        numberSchema = numberSchema.refine(
          (val) => val as number % property.multipleOf === 0,
          {
            message: `Must be a multiple of ${property.multipleOf}`,
          },
        );
      }

      fieldSchema = numberSchema;
      fieldDefault = property.default !== undefined ? property.default : 0;
      break;

    case "boolean":
      fieldSchema = z.boolean();
      fieldDefault = property.default !== undefined ? property.default : false;
      break;

    case "null":
      fieldSchema = z.null();
      fieldDefault = null;
      break;

    default:
      // Handle any other types or unknown types
      fieldSchema = z.any();
      fieldDefault = property.default !== undefined ? property.default : null;
  }

  // Handle nullable fields (type could be an array like ["string", "null"])
  if (Array.isArray(property.type) && property.type.includes("null")) {
    fieldSchema = fieldSchema.nullable();
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
  if (property.default !== undefined) {
    fieldSchema = fieldSchema.default(property.default);
  }

  return { schema: fieldSchema, defaults: fieldDefault };
}

// Helper function to create default item for arrays
export function createDefaultItem(itemSchema: any): any {
  if (!itemSchema) return "";

  if (itemSchema.type === "object" && itemSchema.properties) {
    const result: Record<string, any> = {};
    Object.entries(itemSchema.properties).forEach(
      ([key, value]: [string, any]) => {
        if (value.type === "object" && value.properties) {
          // Recursively handle nested objects
          result[key] = createDefaultItem(value);
        } else if (value.type === "array" && value.items) {
          // Initialize empty array for array types
          result[key] = [];
        } else {
          // Handle primitive types
          result[key] = getDefaultValueForType(value);
        }
      },
    );
    return result;
  }

  return getDefaultValueForType(itemSchema);
}

// Get default value based on type
export function getDefaultValueForType(schema: any): any {
  if (!schema) return "";

  switch (schema.type) {
    case "string":
      return schema.default || "";
    case "number":
    case "integer":
      return schema.default !== undefined ? schema.default : 0;
    case "boolean":
      return schema.default !== undefined ? schema.default : false;
    case "array":
      return schema.default || [];
    case "object":
      if (schema.properties) {
        const result: Record<string, any> = {};
        Object.entries(schema.properties).forEach(
          ([key, value]: [string, any]) => {
            result[key] = getDefaultValueForType(value);
          },
        );
        return result;
      }
      return schema.default || {};
    case "enum":
      return schema.default || schema.values?.[0] || null;
    default:
      return schema.default !== undefined ? schema.default : null;
  }
}
