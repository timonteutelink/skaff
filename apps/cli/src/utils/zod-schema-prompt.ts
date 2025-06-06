import confirm from '@inquirer/confirm';
import input from '@inquirer/input';
import numberPrompt from '@inquirer/number';
import select from '@inquirer/select';
import { z, ZodTypeAny } from 'zod';

type Path = Array<number | string>;

interface PromptContext {
  defaultValue?: any;
  description?: string;
  hasDefault?: boolean;
  isOptional?: boolean;
  parentSchema?: ZodTypeAny;
  path: Path;
}

export async function promptForSchema<T extends ZodTypeAny>(
  schema: T,
  options?: {
    rootName?: string;
    skipValidation?: boolean;
  }
): Promise<z.infer<T>> {
  const rootPath = options?.rootName ? [options.rootName] : ['root'];

  try {
    const result = await promptNode(schema, { path: rootPath });

    if (!options?.skipValidation) {
      const parsed = schema.safeParse(result);
      if (!parsed.success) {
        console.error('❌ Validation errors:', parsed.error.format());
        console.error('\nPlease check your inputs and try again.');

        // Ask if user wants to retry
        const retry = await confirm({
          default: true,
          message: 'Would you like to try again?'
        });

        if (retry) {
          return await promptForSchema(schema, options);
        }

        process.exit(1);
      }

      console.log('✅ All inputs validated successfully!');
      return parsed.data;
    }

    return result as z.infer<T>;
  } catch (error) {
    console.error('❌ An error occurred:', error);
    process.exit(1);
  }
}

async function promptNode(schema: ZodTypeAny, context: PromptContext): Promise<unknown> {
  const pathStr = context.path.join('.');

  // Handle wrapped types first
  const unwrapped = unwrapSchema(schema);
  if (unwrapped.schema !== schema) {
    return promptNode(unwrapped.schema, {
      ...context,
      defaultValue: unwrapped.defaultValue ?? context.defaultValue,
      description: unwrapped.description || context.description,
      hasDefault: unwrapped.hasDefault || context.hasDefault,
      isOptional: unwrapped.isOptional || context.isOptional,
    });
  }

  // Handle optional values (but not if we have a default)
  if (context.isOptional && !context.hasDefault) {
    const shouldProvide = await confirm({
      default: false,
      message: `🤔 Provide value for optional field "${pathStr}"?${context.description ? ` (${context.description})` : ''}`,
    });
    if (!shouldProvide) {
      return undefined;
    }
  }

  // Handle default values
  if (context.hasDefault) {
    const defaultDisplay = typeof context.defaultValue === 'function'
      ? 'function()'
      : JSON.stringify(context.defaultValue);

    const useDefault = await confirm({
      default: true,
      message: `💡 Use default value for "${pathStr}"? ${defaultDisplay}${context.description ? ` (${context.description})` : ''}`,
    });
    if (useDefault) {
      return context.defaultValue;
    }
  }

  return await promptByType(schema, context);
}

function unwrapSchema(schema: ZodTypeAny): {
  defaultValue?: any;
  description?: string;
  hasDefault: boolean;
  isOptional: boolean;
  schema: ZodTypeAny;
} {
  let current = schema;
  let isOptional = false;
  let hasDefault = false;
  let defaultValue: any;
  let description: string | undefined;

  // First, check for description on the original schema
  const originalDef = (schema as any)._def;
  if (originalDef.description) {
    description = originalDef.description;
  }

  while (true) {
    const def = (current as any)._def;

    // Always check for description at each level
    if (def.description && !description) {
      description = def.description;
    }

    if (def.typeName === 'ZodOptional') {
      isOptional = true;
      current = def.innerType;
      continue;
    }

    if (def.typeName === 'ZodDefault') {
      hasDefault = true;
      defaultValue = typeof def.defaultValue === 'function' ? def.defaultValue() : def.defaultValue;
      current = def.innerType;
      continue;
    }

    if (def.typeName === 'ZodNullable') {
      current = def.innerType;
      continue;
    }

    if (def.typeName === 'ZodBranded') {
      current = def.type;
      continue;
    }

    if (def.typeName === 'ZodEffects') {
      current = def.schema;
      continue;
    }

    if (def.typeName === 'ZodLazy') {
      current = def.getter();
      continue;
    }

    if (def.typeName === 'ZodPromise') {
      current = def.type;
      continue;
    }

    if (def.typeName === 'ZodReadonly') {
      current = def.innerType;
      continue;
    }

    if (def.typeName === 'ZodCatch') {
      current = def.innerType;
      continue;
    }

    break;
  }

  return {
    defaultValue,
    description,
    hasDefault,
    isOptional,
    schema: current,
  };
}

async function promptByType(schema: ZodTypeAny, context: PromptContext): Promise<unknown> {
  const def = (schema as any)._def;
  const {typeName} = def;
  const pathStr = context.path.join('.');
  const descriptionSuffix = context.description ? ` (${context.description})` : '';

  switch (typeName) {
    case 'ZodAny': {
      return await input({
        message: `❓ Enter any value for "${pathStr}"${descriptionSuffix} (will be parsed as JSON):`,
        validate(value) {
          try {
            JSON.parse(value);
            return true;
          } catch {
            return 'Must be valid JSON';
          }
        },
      }).then(value => {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      });
    }

    case 'ZodArray': {
      const itemSchema = def.type;
      let min = 0;
      let max = Infinity;

      // Check for array length constraints
      if (def.minLength) min = def.minLength.value;
      if (def.maxLength) max = def.maxLength.value;
      if (def.exactLength) {
        min = max = def.exactLength.value;
      }

      const constraintInfo = min > 0 || max < Infinity
        ? ` [${min === max ? `exactly ${min}` : `${min > 0 ? `min: ${min}` : ''}${min > 0 && max < Infinity ? ', ' : ''}${max < Infinity ? `max: ${max}` : ''}`}]`
        : '';

      const count = await numberPrompt({
        message: `📦 How many items for array "${pathStr}"${constraintInfo}${descriptionSuffix}?`,
        validate(value) {
          if (value === undefined || value === null) return 'Count is required';
          if (value < min) return `Minimum ${min} items required`;
          if (value > max) return `Maximum ${max} items allowed`;
          return true;
        },
      });

      const items: unknown[] = [];
      for (let i = 0; i < (count || 0); i++) {
        console.log(`\n  📝 Item ${i + 1}/${count}:`);
        const itemPath = [...context.path, i];
        items.push(await promptNode(itemSchema, { path: itemPath }));
      }

      return items;
    }

    case 'ZodBigInt': {
      const constraints: string[] = [];

      if (def.checks) {
        for (const check of def.checks) {
          switch (check.kind) {
            case 'max': {
              constraints.push(`max: ${check.value}${check.inclusive ? ' (inclusive)' : ' (exclusive)'}`);
              break;
            }

            case 'min': {
              constraints.push(`min: ${check.value}${check.inclusive ? ' (inclusive)' : ' (exclusive)'}`);
              break;
            }

            case 'multipleOf': {
              constraints.push(`multiple of: ${check.value}`);
              break;
            }
          }
        }
      }

      const constraintInfo = constraints.length > 0 ? ` [${constraints.join(', ')}]` : '';

      const value = await input({
        message: `🔢 Enter BigInt for "${pathStr}"${constraintInfo}${descriptionSuffix} (integer string):`,
        validate(value) {
          if (!/^-?\d+$/.test(value)) return 'Must be a valid integer string';
          try {
            const bigIntValue = BigInt(value);
            const result = schema.safeParse(bigIntValue);
            return result.success || result.error.errors[0]?.message || 'Invalid BigInt';
          } catch {
            return 'Invalid BigInt format';
          }
        },
      });
      return BigInt(value);
    }

    case 'ZodBoolean': {
      return await confirm({
        default: false,
        message: `❓ "${pathStr}"${descriptionSuffix}:`,
      });
    }

    case 'ZodDate': {
      const constraints: string[] = [];

      if (def.checks) {
        for (const check of def.checks) {
          switch (check.kind) {
            case 'max': {
              constraints.push(`max date: ${check.value.toISOString()}`);
              break;
            }

            case 'min': {
              constraints.push(`min date: ${check.value.toISOString()}`);
              break;
            }
          }
        }
      }

      const constraintInfo = constraints.length > 0 ? ` [${constraints.join(', ')}]` : '';

      const value = await input({
        message: `📅 Enter date for "${pathStr}"${constraintInfo}${descriptionSuffix} (ISO format, e.g., 2023-12-25 or 2023-12-25T10:30:00Z):`,
        validate(value) {
          const date = new Date(value);
          if (isNaN(date.getTime())) return 'Invalid date format';
          const result = schema.safeParse(date);
          return result.success || result.error.errors[0]?.message || 'Invalid date';
        },
      });
      return new Date(value);
    }

    case 'ZodDiscriminatedUnion': {
      const {discriminator} = def;
      const {optionsMap} = def;

      const discriminatorValue = await select({
        choices: [...optionsMap.keys()].map((key: any) => ({
          name: String(key),
          value: key,
        })),
        message: `🎯 Select "${discriminator}" for "${pathStr}"${descriptionSuffix}:`,
      });

      const selectedSchema = optionsMap.get(discriminatorValue);
      return await promptNode(selectedSchema, context);
    }

    case 'ZodEnum': {
      return await select({
        choices: def.values.map((value: any) => ({
          name: String(value),
          value,
        })),
        message: `📋 Select "${pathStr}"${descriptionSuffix}:`,
      });
    }

    case 'ZodIntersection': {
      const {left} = def;
      const {right} = def;

      console.log(`\n🔗 Building intersection for "${pathStr}"${descriptionSuffix}:`);
      console.log('  📝 First part:');
      const leftResult = await promptNode(left, context);

      console.log('  📝 Second part:');
      const rightResult = await promptNode(right, context);

      // Merge objects if both are objects
      if (typeof leftResult === 'object' && typeof rightResult === 'object' &&
        leftResult !== null && rightResult !== null &&
        !Array.isArray(leftResult) && !Array.isArray(rightResult)) {
        return { ...leftResult, ...rightResult };
      }

      // For non-objects, the intersection might not make sense, but we'll try to validate
      throw new Error(`Cannot merge intersection results at ${pathStr}: incompatible types`);
    }

    case 'ZodNullable': {
      const isNull = await confirm({
        default: false,
        message: `❓ Set "${pathStr}" to null${descriptionSuffix}?`,
      });

      if (isNull) return null;

      return await promptNode(def.innerType, context);
    }

    case 'ZodLiteral': {
      console.log(`💎 Literal value for "${pathStr}": ${JSON.stringify(def.value)}`);
      return def.value;
    }

    case 'ZodMap': {
      const {keyType} = def;
      const {valueType} = def;

      const count = await numberPrompt({
        message: `🗺️  How many entries for map "${pathStr}"${descriptionSuffix}?`,
        validate: (value) => value !== undefined && value >= 0 || 'Must be non-negative number',
      });

      const map = new Map();
      for (let i = 0; i < (count || 0); i++) {
        console.log(`\n  🔑 Map entry ${i + 1}/${count}:`);

        // For map keys, we need to handle different key types
        const keyPath = [...context.path, `key_${i}`];
        const key = await promptNode(keyType, { path: keyPath });

        const valuePath = [...context.path, `value_${i}`];
        const value = await promptNode(valueType, { path: valuePath });

        map.set(key, value);
      }

      return map;
    }

    case 'ZodNaN': {
      console.log(`💎 NaN value for "${pathStr}"`);
      return Number.NaN;
    }

    case 'ZodNativeEnum': {
      const enumValues = Object.values(def.values);
      return await select({
        choices: enumValues.map((value: any) => ({
          name: String(value),
          value,
        })),
        message: `📋 Select "${pathStr}"${descriptionSuffix}:`,
      });
    }

    case 'ZodNull': {
      console.log(`💎 Null value for "${pathStr}"`);
      return null;
    }

    case 'ZodNumber': {
      const constraints: string[] = [];

      if (def.checks) {
        for (const check of def.checks) {
          switch (check.kind) {
            case 'finite': {
              constraints.push('finite number');
              break;
            }

            case 'int': {
              constraints.push('integer only');
              break;
            }

            case 'max': {
              constraints.push(`max: ${check.value}${check.inclusive ? ' (inclusive)' : ' (exclusive)'}`);
              break;
            }

            case 'min': {
              constraints.push(`min: ${check.value}${check.inclusive ? ' (inclusive)' : ' (exclusive)'}`);
              break;
            }

            case 'multipleOf': {
              constraints.push(`multiple of: ${check.value}`);
              break;
            }
          }
        }
      }

      const constraintInfo = constraints.length > 0 ? ` [${constraints.join(', ')}]` : '';

      return await numberPrompt({
        message: `🔢 Enter number for "${pathStr}"${constraintInfo}${descriptionSuffix}:`,
        validate(value) {
          if (value === undefined || value === null) return 'Number is required';
          const result = schema.safeParse(value);
          return result.success || result.error.errors[0]?.message || 'Invalid number';
        },
      });
    }

    case 'ZodObject': {
      console.log(`\n🏗️  Building object for "${pathStr}"${descriptionSuffix}:`);
      const shape = def.shape();
      const result: Record<string, unknown> = {};

      // Handle catchall
      const {catchall} = def;

      // Get known keys first
      const knownKeys = Object.keys(shape);
      for (const key of knownKeys) {
        const fieldSchema = shape[key] as ZodTypeAny;
        const fieldPath = [...context.path, key];
        result[key] = await promptNode(fieldSchema, { path: fieldPath });
      }

      // Handle catchall if present
      if (catchall && catchall._def.typeName !== 'ZodNever') {
        const addExtra = await confirm({
          default: false,
          message: `➕ Add additional properties to "${pathStr}"?`,
        });

        if (addExtra) {
          const extraCount = await numberPrompt({
            message: 'How many additional properties?',
            validate: (value) => value !== undefined && value >= 0 || 'Must be non-negative',
          });

          for (let i = 0; i < (extraCount || 0); i++) {
            const key = await input({
              message: `Enter key for additional property #${i + 1}:`,
              validate(value) {
                if (!value.trim()) return 'Key cannot be empty';
                if (knownKeys.includes(value)) return 'Key already exists';
                return true;
              },
            });

            const fieldPath = [...context.path, key];
            result[key] = await promptNode(catchall, { path: fieldPath });
          }
        }
      }

      return result;
    }

    case 'ZodRecord': {
      const keyType = def.keyType || z.string();
      const {valueType} = def;

      const count = await numberPrompt({
        message: `🗂️  How many entries for record "${pathStr}"${descriptionSuffix}?`,
        validate: (value) => value !== undefined && value >= 0 || 'Must be non-negative number',
      });

      const record: Record<string, unknown> = {};
      for (let i = 0; i < (count || 0); i++) {
        console.log(`\n  🔑 Entry ${i + 1}/${count}:`);

        const key = await input({
          message: `Enter key #${i + 1}:`,
          validate(value) {
            if (!value.trim()) return 'Key cannot be empty';
            const result = keyType.safeParse(value);
            return result.success || result.error.errors[0]?.message || 'Invalid key';
          },
        });

        const valuePath = [...context.path, key];
        record[key] = await promptNode(valueType, { path: valuePath });
      }

      return record;
    }

    case 'ZodSet': {
      const {valueType} = def;
      let min = 0;
      let max = Infinity;

      // Check for set size constraints
      if (def.minSize) min = def.minSize.value;
      if (def.maxSize) max = def.maxSize.value;

      const constraintInfo = min > 0 || max < Infinity
        ? ` [${min > 0 ? `min: ${min}` : ''}${min > 0 && max < Infinity ? ', ' : ''}${max < Infinity ? `max: ${max}` : ''}]`
        : '';

      const count = await numberPrompt({
        message: `🎯 How many unique items for set "${pathStr}"${constraintInfo}${descriptionSuffix}?`,
        validate(value) {
          if (value === undefined || value === null) return 'Count is required';
          if (value < min) return `Minimum ${min} items required`;
          if (value > max) return `Maximum ${max} items allowed`;
          return true;
        },
      });

      const set = new Set();
      let attempts = 0;
      const maxAttempts = (count || 0) * 3; // Allow some retries for duplicates

      for (let i = 0; i < (count || 0) && attempts < maxAttempts; attempts++) {
        console.log(`\n  📝 Set item ${set.size + 1}/${count}:`);
        const itemPath = [...context.path, `item_${i}`];
        const item = await promptNode(valueType, { path: itemPath });

        if (set.has(item)) {
          console.log(`⚠️  Item already exists in set, please enter a different value.`);
          continue;
        }

        set.add(item);
        i++;
      }

      if (set.size < (count || 0)) {
        console.log(`⚠️  Only ${set.size} unique items added (requested ${count})`);
      }

      return set;
    }

    case 'ZodString': {
      const constraints: string[] = [];

      // Check for string constraints
      if (def.checks) {
        for (const check of def.checks) {
          switch (check.kind) {
            case 'cuid': {
              constraints.push('CUID format');
              break;
            }

            case 'cuid2': {
              constraints.push('CUID2 format');
              break;
            }

            case 'datetime': {
              constraints.push('datetime format');
              break;
            }

            case 'email': {
              constraints.push('email format');
              break;
            }

            case 'emoji': {
              constraints.push('emoji only');
              break;
            }

            case 'endsWith': {
              constraints.push(`must end with: "${check.value}"`);
              break;
            }

            case 'includes': {
              constraints.push(`must include: "${check.value}"`);
              break;
            }

            case 'ip': {
              constraints.push(`IP address${check.version ? ` (v${check.version})` : ''}`);
              break;
            }

            case 'length': {
              constraints.push(`exact length: ${check.value}`);
              break;
            }

            case 'max': {
              constraints.push(`max length: ${check.value}`);
              break;
            }

            case 'min': {
              constraints.push(`min length: ${check.value}`);
              break;
            }

            case 'regex': {
              constraints.push(`pattern: ${check.regex}`);
              break;
            }

            case 'startsWith': {
              constraints.push(`must start with: "${check.value}"`);
              break;
            }

            case 'ulid': {
              constraints.push('ULID format');
              break;
            }

            case 'url': {
              constraints.push('URL format');
              break;
            }

            case 'uuid': {
              constraints.push('UUID format');
              break;
            }
          }
        }
      }

      const constraintInfo = constraints.length > 0 ? ` [${constraints.join(', ')}]` : '';

      return await input({
        message: `📝 Enter string for "${pathStr}"${constraintInfo}${descriptionSuffix}:`,
        validate(value) {
          if (value === '') {
            // Check if empty string is allowed
            const result = schema.safeParse('');
            if (!result.success) {
              return 'Value is required';
            }
          }

          const result = schema.safeParse(value);
          return result.success || result.error.errors[0]?.message || 'Invalid input';
        },
      });
    }

    case 'ZodTuple': {
      const items = def.items as ZodTypeAny[];
      const {rest} = def;

      console.log(`\n📋 Building tuple for "${pathStr}" (${items.length} fixed items)${descriptionSuffix}:`);

      const result: unknown[] = [];

      // Handle fixed items
      for (let i = 0; i < items.length; i++) {
        console.log(`\n  📝 Tuple item ${i + 1}/${items.length}:`);
        const itemPath = [...context.path, i];
        result.push(await promptNode(items[i]!, { path: itemPath }));
      }

      // Handle rest items if present
      if (rest) {
        const addRest = await confirm({
          default: false,
          message: `➕ Add additional items to tuple "${pathStr}"?`,
        });

        if (addRest) {
          const restCount = await numberPrompt({
            message: 'How many additional items?',
            validate: (value) => value !== undefined && value >= 0 || 'Must be non-negative',
          });

          for (let i = 0; i < (restCount || 0); i++) {
            console.log(`\n  📝 Additional item ${i + 1}/${restCount}:`);
            const itemPath = [...context.path, items.length + i];
            result.push(await promptNode(rest, { path: itemPath }));
          }
        }
      }

      return result;
    }

    case 'ZodUndefined': {
      console.log(`💎 Undefined value for "${pathStr}"`);
      return undefined;
    }

    case 'ZodUnion': {
      const options = def.options as ZodTypeAny[];

      // Special case for literal unions (like enums)
      if (options.every((opt: any) => opt._def.typeName === 'ZodLiteral')) {
        const values = options.map((opt: any) => opt._def.value);
        return await select({
          choices: values.map((value: any) => ({
            name: JSON.stringify(value),
            value,
          })),
          message: `🎯 Select value for "${pathStr}"${descriptionSuffix}:`,
        });
      }

      // For complex unions, let user choose the type
      const choiceIndex = await select({
        choices: options.map((option: any, index: number) => ({
          name: `Option ${index + 1}: ${getSchemaDescription(option)}`,
          value: index,
        })),
        message: `🤔 Select type for union "${pathStr}"${descriptionSuffix}:`,
      });

      return await promptNode(options[choiceIndex]!, context);
    }

    case 'ZodUnknown': {
      return await input({
        message: `❓ Enter unknown value for "${pathStr}"${descriptionSuffix} (will be parsed as JSON):`,
        validate(value) {
          try {
            JSON.parse(value);
            return true;
          } catch {
            return 'Must be valid JSON';
          }
        },
      }).then(value => {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      });
    }

    case 'ZodVoid': {
      console.log(`💎 Void value for "${pathStr}"`);
      return undefined;
    }

    case 'ZodNever': {
      throw new Error(`❌ ZodNever type encountered at path: ${pathStr}. This should never happen.`);
    }

    case 'ZodFunction': {
      throw new Error(`❌ Cannot prompt for function type at path: ${pathStr}`);
    }

    case 'ZodSymbol': {
      throw new Error(`❌ Cannot prompt for symbol type at path: ${pathStr}`);
    }

    default: {
      throw new Error(`❌ Unsupported Zod type: ${typeName} at path: ${pathStr}`);
    }
  }
}

function getSchemaDescription(schema: ZodTypeAny): string {
  const def = (schema as any)._def;
  const {typeName} = def;

  // Check for description first
  if (def.description) {
    return def.description;
  }

  switch (typeName) {
    case 'ZodAny': { return 'any';
    }

    case 'ZodArray': { return `array of ${getSchemaDescription(def.type)}`;
    }

    case 'ZodBigInt': { return 'bigint';
    }

    case 'ZodBoolean': { return 'boolean';
    }

    case 'ZodDate': { return 'date';
    }

    case 'ZodDefault': { return `default ${getSchemaDescription(def.innerType)}`;
    }

    case 'ZodDiscriminatedUnion': { return `discriminatedUnion`;
    }

    case 'ZodEnum': { return `enum: ${def.values.join(' | ')}`;
    }

    case 'ZodIntersection': { return `intersection`;
    }

    case 'ZodLiteral': { return `literal: ${JSON.stringify(def.value)}`;
    }

    case 'ZodMap': { return `map<${getSchemaDescription(def.keyType)}, ${getSchemaDescription(def.valueType)}>`;
    }

    case 'ZodNaN': { return 'NaN';
    }

    case 'ZodNativeEnum': { return `nativeEnum: ${Object.values(def.values).join(' | ')}`;
    }

    case 'ZodNever': { return 'never';
    }

    case 'ZodNull': { return 'null';
    }

    case 'ZodNullable': { return `nullable ${getSchemaDescription(def.innerType)}`;
    }

    case 'ZodNumber': { return 'number';
    }

    case 'ZodObject': { return 'object';
    }

    case 'ZodOptional': { return `optional ${getSchemaDescription(def.innerType)}`;
    }

    case 'ZodRecord': { return `record<${getSchemaDescription(def.keyType || z.string())}, ${getSchemaDescription(def.valueType)}>`;
    }

    case 'ZodSet': { return `set<${getSchemaDescription(def.valueType)}>`;
    }

    case 'ZodString': { return 'string';
    }

    case 'ZodTuple': { return `tuple[${def.items.map(getSchemaDescription).join(', ')}]`;
    }

    case 'ZodUndefined': { return 'undefined';
    }

    case 'ZodUnion': { return `union: ${def.options.map(getSchemaDescription).join(' | ')}`;
    }

    case 'ZodUnknown': { return 'unknown';
    }

    case 'ZodVoid': { return 'void';
    }

    default: { return typeName.replace('Zod', '').toLowerCase();
    }
  }
}

