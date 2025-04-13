import * as z from "zod"
import type { SchemaResult } from "./types"

// Recursively build zod schema and default values
export function buildSchemaAndDefaults(jsonSchema: any, path = ""): SchemaResult {
	if (!jsonSchema) {
		return {
			schema: z.any(),
			defaults: undefined,
			required: {},
		}
	}

	// Handle root schema or nested object schema
	if (jsonSchema.type === "object" && jsonSchema.properties) {
		const schemaShape: Record<string, z.ZodTypeAny> = {}
		const defaults: Record<string, any> = {}
		const required: Record<string, string[]> = {}

		// Store required fields for this path
		required[path || "root"] = jsonSchema.required || []

		Object.entries(jsonSchema.properties).forEach(([key, value]: [string, any]) => {
			const currentPath = path ? `${path}.${key}` : key
			const isRequiredField = (jsonSchema.required || []).includes(key)

			if (value.type === "object" && value.properties) {
				// Recursively handle nested objects
				const {
					schema: nestedSchema,
					defaults: nestedDefaults,
					required: nestedRequired,
				} = buildSchemaAndDefaults(value, currentPath)

				schemaShape[key] = isRequiredField ? nestedSchema : nestedSchema.optional()
				defaults[key] = value.default || nestedDefaults

				// Merge nested required fields
				Object.assign(required, nestedRequired)
			} else if (value.type === "array" && value.items) {
				// Handle arrays
				const {
					schema: itemSchema,
					defaults: itemDefaults,
					required: itemRequired,
				} = buildArraySchema(value.items, `${currentPath}[]`)

				let arraySchema = z.array(itemSchema)

				// Apply array constraints
				if (value.minItems !== undefined) {
					arraySchema = arraySchema.min(value.minItems, {
						message: `Must have at least ${value.minItems} items`,
					})
				}

				if (value.maxItems !== undefined) {
					arraySchema = arraySchema.max(value.maxItems, {
						message: `Must have at most ${value.maxItems} items`,
					})
				}

				schemaShape[key] = isRequiredField ? arraySchema : arraySchema.optional()
				defaults[key] = value.default || []

				// Merge array item required fields
				Object.assign(required, itemRequired)
			} else {
				// Handle primitive types
				const { schema: fieldSchema, defaults: fieldDefault } = buildFieldSchema(value, isRequiredField)

				schemaShape[key] = fieldSchema
				defaults[key] = fieldDefault
			}
		})

		return {
			schema: z.object(schemaShape),
			defaults,
			required,
		}
	}

	// Fallback
	return {
		schema: z.any(),
		defaults: undefined,
		required: {},
	}
}

// Build schema for array items
export function buildArraySchema(itemSchema: any, path = ""): SchemaResult {
	if (!itemSchema) {
		return {
			schema: z.any(),
			defaults: undefined,
			required: {},
		}
	}

	// Handle array of objects
	if (itemSchema.type === "object" && itemSchema.properties) {
		return buildSchemaAndDefaults(itemSchema, path)
	}

	// Handle array of primitives
	const { schema, defaults } = buildFieldSchema(itemSchema, false)
	return {
		schema,
		defaults,
		required: {},
	}
}

// Build schema for a specific field
export function buildFieldSchema(property: any, isRequired = false): { schema: z.ZodTypeAny; defaults: any } {
	let fieldSchema: z.ZodTypeAny
	let fieldDefault: any

	// Handle different types
	switch (property.type) {
		case "string":
			// Handle string formats
			if (property.format === "date-time" || property.format === "date") {
				fieldSchema = z.date()
				fieldDefault = property.default ? new Date(property.default) : null
			} else if (property.format === "email") {
				fieldSchema = z.string().email({ message: "Invalid email address" })
				fieldDefault = property.default || ""
			} else if (property.format === "uri" || property.format === "url") {
				fieldSchema = z.string().url({ message: "Invalid URL" })
				fieldDefault = property.default || ""
			} else if (property.enum) {
				fieldSchema = z.enum(property.enum as [string, ...string[]])
				fieldDefault = property.default || property.enum[0]
			} else {
				// Regular string with potential constraints
				let stringSchema = z.string()

				if (property.minLength !== undefined) {
					stringSchema = stringSchema.min(property.minLength, {
						message: `Must be at least ${property.minLength} characters`,
					})
				}

				if (property.maxLength !== undefined) {
					stringSchema = stringSchema.max(property.maxLength, {
						message: `Must be at most ${property.maxLength} characters`,
					})
				}

				if (property.pattern) {
					stringSchema = stringSchema.regex(new RegExp(property.pattern), {
						message: property.patternMessage || "Invalid format",
					})
				}

				fieldSchema = stringSchema
				fieldDefault = property.default || ""
			}
			break

		case "number":
		case "integer":
			let numberSchema: z.ZodTypeAny = property.type === "integer" ? z.number().int() : z.number()

			if (property.minimum !== undefined) {
				numberSchema = (numberSchema as z.ZodNumber).min(property.minimum, {
					message: `Must be at least ${property.minimum}`,
				})
			}

			if (property.maximum !== undefined) {
				numberSchema = (numberSchema as z.ZodNumber).max(property.maximum, {
					message: `Must be at most ${property.maximum}`,
				})
			}

			if (property.multipleOf !== undefined) {
				numberSchema = numberSchema.refine((val) => val % property.multipleOf === 0, {
					message: `Must be a multiple of ${property.multipleOf}`,
				})
			}

			fieldSchema = numberSchema
			fieldDefault = property.default !== undefined ? property.default : 0
			break

		case "boolean":
			fieldSchema = z.boolean()
			fieldDefault = property.default !== undefined ? property.default : false
			break

		case "null":
			fieldSchema = z.null()
			fieldDefault = null
			break

		default:
			// Handle any other types or unknown types
			fieldSchema = z.any()
			fieldDefault = property.default !== undefined ? property.default : null
	}

	// Handle nullable fields (type could be an array like ["string", "null"])
	if (Array.isArray(property.type) && property.type.includes("null")) {
		fieldSchema = fieldSchema.nullable()
	}

	// Make field optional if not required
	if (!isRequired) {
		fieldSchema = fieldSchema.optional()
	} else {
		// For required fields, add validation message
		if (fieldSchema instanceof z.ZodString) {
			fieldSchema = fieldSchema.min(1, { message: "This field is required" })
		}
	}

	return { schema: fieldSchema, defaults: fieldDefault }
}

// Helper function to create default item for arrays
export function createDefaultItem(itemSchema: any): any {
	if (!itemSchema) return ""

	if (itemSchema.type === "object" && itemSchema.properties) {
		const result: Record<string, any> = {}
		Object.entries(itemSchema.properties).forEach(([key, value]: [string, any]) => {
			if (value.type === "object" && value.properties) {
				// Recursively handle nested objects
				result[key] = createDefaultItem(value)
			} else if (value.type === "array" && value.items) {
				// Initialize empty array for array types
				result[key] = []
			} else {
				// Handle primitive types
				result[key] = getDefaultValueForType(value)
			}
		})
		return result
	}

	return getDefaultValueForType(itemSchema)
}

// Get default value based on type
export function getDefaultValueForType(schema: any): any {
	if (!schema) return ""

	switch (schema.type) {
		case "string":
			return schema.default || ""
		case "number":
		case "integer":
			return schema.default !== undefined ? schema.default : 0
		case "boolean":
			return schema.default !== undefined ? schema.default : false
		case "array":
			return schema.default || []
		case "object":
			if (schema.properties) {
				const result: Record<string, any> = {}
				Object.entries(schema.properties).forEach(([key, value]: [string, any]) => {
					result[key] = getDefaultValueForType(value)
				})
				return result
			}
			return schema.default || {}
		default:
			return schema.default !== undefined ? schema.default : null
	}
}

