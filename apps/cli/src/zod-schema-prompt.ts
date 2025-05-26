import confirm from '@inquirer/confirm';
import input from '@inquirer/input';
import numberPrompt from '@inquirer/number';
import select from '@inquirer/select';

import {
  ZodArray,
  ZodBigInt,
  ZodBoolean,
  ZodBranded,
  ZodDate,
  ZodDefault,
  ZodDiscriminatedUnion,
  ZodEffects,
  ZodEnum,
  ZodIntersection,
  ZodLazy,
  ZodLiteral,
  ZodMap,
  ZodNaN,
  ZodNativeEnum,
  ZodNull,
  ZodNullable,
  ZodNumber,
  ZodObject,
  ZodOptional,
  ZodPromise,
  ZodRecord,
  ZodSet,
  ZodString,
  ZodTuple,
  ZodTypeAny,
  ZodUndefined,
  ZodUnion,
  z,
} from 'zod';

// Generic prompt function for any Zod schema
type Path = Array<string | number>;

export async function promptForSchema<T extends ZodTypeAny>(schema: T): Promise<z.infer<T>> {
  const result = await promptNode(schema, []);
  const parsed = schema.safeParse(result);
  if (!parsed.success) {
    console.error('Validation errors:', parsed.error.format());
    process.exit(1);
  }
  return parsed.data;
}

async function promptNode(schema: ZodTypeAny, path: Path): Promise<unknown> {
  // Unwrap branded, optional, default, nullable, effects, lazy
  if (
    schema instanceof ZodBranded ||
    schema instanceof ZodOptional ||
    schema instanceof ZodDefault ||
    schema instanceof ZodNullable
  ) {
    const inner = (schema as any)._def.innerType || (schema as any)._def.schema;
    if (schema instanceof ZodDefault) {
      const defaultVal = (schema as any)._def.defaultValue();
      const useDefault = await confirm({ message: `Use default for ${path.join('.')}? (${JSON.stringify(defaultVal)})`, default: true });
      if (useDefault) return defaultVal;
    }
    if (schema instanceof ZodNullable) {
      const isNull = await confirm({ message: `Set ${path.join('.')} to null?` });
      if (isNull) return null;
    }
    return promptNode(inner, path);
  }
  if (schema instanceof ZodEffects) {
    return promptNode((schema as ZodEffects<any, any>)._def.schema, path);
  }
  if (schema instanceof ZodLazy) {
    const inner = (schema as ZodLazy<any>)._def.getter();
    return promptNode(inner, path);
  }
  if (schema instanceof ZodPromise) {
    const inner = (schema as ZodPromise<any>)._def.type;
    return promptNode(inner, path);
  }

  const typeName = schema._def.typeName;
  switch (typeName) {
    case ZodObject.prototype._def.typeName: {
      const shape = (schema as ZodObject<any>)._def.shape();
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(shape)) {
        result[key] = await promptNode(shape[key], [...path, key]);
      }
      return result;
    }
    case ZodArray.prototype._def.typeName: {
      const itemSchema = (schema as ZodArray<any>)._def.type;
      const count = await numberPrompt({ message: `How many items for ${path.join('.')}?` });
      const arr: unknown[] = [];
      for (let i = 0; i < (count || 0); i++) {
        arr.push(await promptNode(itemSchema, [...path, i]));
      }
      return arr;
    }
    case ZodTuple.prototype._def.typeName: {
      const items = (schema as ZodTuple<any>)._def.items as ZodTypeAny[];
      const tuple: unknown[] = [];
      for (let i = 0; i < items.length; i++) {
        tuple.push(await promptNode(items[i]!, [...path, i]));
      }
      return tuple;
    }
    case ZodRecord.prototype._def.typeName: {
      const { keyType, valueType } = (schema as ZodRecord<any, any>)._def;
      const count = await numberPrompt({ message: `Entries for ${path.join('.')}?` });
      const rec: Record<string, unknown> = {};
      for (let i = 0; i < (count || 0); i++) {
        const key = await input({ message: `Key #${i + 1} for ${path.join('.')}`, validate: val => { try { keyType.parse(val); return true; } catch { return 'Invalid key'; } } });
        rec[key] = await promptNode(valueType, [...path, key]);
      }
      return rec;
    }
    case ZodMap.prototype._def.typeName: {
      const { keyType, valueType } = (schema as ZodMap<any, any>)._def;
      const count = await numberPrompt({ message: `Map entries for ${path.join('.')}?` });
      const map = new Map<unknown, unknown>();
      for (let i = 0; i < (count || 0); i++) {
        const keyRaw = await input({ message: `Map key #${i + 1} for ${path.join('.')}` });
        const key = keyType.parse(keyRaw);
        const value = await promptNode(valueType, [...path, keyRaw]);
        map.set(key, value);
      }
      return map;
    }
    case ZodSet.prototype._def.typeName: {
      const valueType = (schema as ZodSet<any>)._def.valueType;
      const count = await numberPrompt({ message: `Set size for ${path.join('.')}?` });

      const set = new Set<unknown>();
      for (let i = 0; i < (count || 0); i++) {
        set.add(await promptNode(valueType, [...path, i]));
      }
      return set;
    }
    case ZodIntersection.prototype._def.typeName: {
      const { left, right } = (schema as ZodIntersection<any, any>)._def;
      const leftVal = await promptNode(left, path);
      const rightVal = await promptNode(right, path);
      return Object.assign({}, leftVal as object, rightVal as object);
    }
    case ZodDiscriminatedUnion.prototype._def.typeName:
    case ZodUnion.prototype._def.typeName: {
      const options: ZodTypeAny[] = (schema as any)._def.options;
      if (options.every(o => o instanceof ZodLiteral)) {
        const vals = options.map(o => (o as ZodLiteral<any>)._def.value);
        const choice = await select({ message: `Choose ${path.join('.')}`, choices: vals });
        return choice;
      }
      if (schema instanceof ZodDiscriminatedUnion) {
        const mapping = (schema as any)._def.options;
        const branch = await select({ message: `Select variant for ${path.join('.')}`, choices: Object.keys(mapping) });
        return promptNode(mapping[branch as any], path);
      }
      const idx = await select({ message: `Select branch for ${path.join('.')}`, choices: options.map((_, i) => `${i}`) });
      return promptNode(options[Number(idx)]!, path);
    }
    case ZodEnum.prototype._def.typeName:
    case ZodNativeEnum.prototype._def.typeName: {
      const values = (schema as any)._def.values;
      return await select({ message: `Select ${path.join('.')}`, choices: values });
    }
    case ZodBoolean.prototype._def.typeName: {
      return await confirm({ message: `Flag ${path.join('.')}` });
    }
    case ZodString.prototype._def.typeName: {
      return await input({ message: `Value for ${path.join('.')}`, validate: v => v.length > 0 || 'Required' });
    }
    case ZodNumber.prototype._def.typeName:
    case ZodNaN.prototype._def.typeName: {
      return await numberPrompt({ message: `Number for ${path.join('.')}`, validate: v => v != undefined && !isNaN(v) || 'Must be a number' });
    }
    case ZodBigInt.prototype._def.typeName: {
      const val = await input({ message: `BigInt for ${path.join('.')}`, validate: v => /^-?\\d+$/.test(v) || 'Must be integer string' });
      return BigInt(val);
    }
    case ZodDate.prototype._def.typeName: {
      const val = await input({ message: `Date (ISO) for ${path.join('.')}`, validate: v => !isNaN(Date.parse(v)) || 'Invalid date' });
      return new Date(val);
    }
    case ZodLiteral.prototype._def.typeName: {
      return (schema as ZodLiteral<any>)._def.value;
    }
    case ZodNull.prototype._def.typeName: return null;
    case ZodUndefined.prototype._def.typeName: return undefined;
    default:
      throw new Error(`Unsupported Zod type: ${typeName} at ${path.join('.')}`);
  }
}

