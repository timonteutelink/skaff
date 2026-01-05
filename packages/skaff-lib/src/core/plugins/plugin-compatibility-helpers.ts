import type { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { z } from "zod";
import type { Result } from "../../lib/types";
import {
  extractPluginName,
  formatTemplateSettingsSchemaWarning,
  type TemplateSettingsSchemaCompatibility,
  type TemplateSettingsWarning,
} from "./plugin-compatibility";
import type {
  NormalizedTemplatePluginConfig,
  SkaffPluginModule,
} from "./plugin-types";

export type TemplateSettingsSchemaInput =
  | z.ZodObject<UserTemplateSettings>
  | z.core.JSONSchema.BaseSchema;

export interface PluginCompatibilityValidationResult {
  globalConfigResult: Result<void>;
  templateSettingsWarning?: TemplateSettingsWarning;
}

export function validatePluginCompatibilitySettings({
  pluginConfig,
  pluginModule,
  pluginSettings,
  templateSettingsSchema,
}: {
  pluginConfig: NormalizedTemplatePluginConfig;
  pluginModule: SkaffPluginModule;
  pluginSettings?: Record<string, unknown>;
  templateSettingsSchema?: TemplateSettingsSchemaInput;
}): PluginCompatibilityValidationResult {
  const pluginName =
    pluginModule.manifest?.name ?? extractPluginName(pluginConfig.module);

  const globalConfigResult = validateGlobalPluginSettings({
    pluginName,
    pluginModule,
    pluginSettings,
  });

  const templateSettingsWarning = validateTemplateSettingsCompatibility({
    pluginConfig,
    pluginModule,
    templateSettingsSchema,
    pluginName,
  });

  return { globalConfigResult, templateSettingsWarning };
}

export function checkTemplateSettingsSchemaCompatibilityFromInput(
  templateSchema: TemplateSettingsSchemaInput,
  requiredSchema: TemplateSettingsSchemaInput,
): TemplateSettingsSchemaCompatibility {
  const templateInfo = getJsonSchemaInfo(coerceToJsonSchema(templateSchema));
  const requiredInfo = getJsonSchemaInfo(coerceToJsonSchema(requiredSchema));

  const missingKeys = [...requiredInfo.properties].filter(
    (key) => !templateInfo.properties.has(key),
  );
  const optionalKeys = [...requiredInfo.required].filter(
    (key) =>
      templateInfo.properties.has(key) && !templateInfo.required.has(key),
  );

  return {
    compatible: missingKeys.length === 0 && optionalKeys.length === 0,
    missingKeys,
    optionalKeys,
  };
}

function validateGlobalPluginSettings({
  pluginName,
  pluginModule,
  pluginSettings,
}: {
  pluginName: string;
  pluginModule: SkaffPluginModule;
  pluginSettings?: Record<string, unknown>;
}): Result<void> {
  if (!pluginModule.globalConfigSchema) {
    return { data: undefined };
  }

  const rawSettings = pluginSettings?.[pluginName];
  const parsed = pluginModule.globalConfigSchema.safeParse(rawSettings ?? {});

  if (!parsed.success) {
    return {
      error: `Invalid global config for plugin ${pluginName}: ${parsed.error}`,
    };
  }

  return { data: undefined };
}

function validateTemplateSettingsCompatibility({
  pluginConfig,
  pluginModule,
  templateSettingsSchema,
  pluginName,
}: {
  pluginConfig: NormalizedTemplatePluginConfig;
  pluginModule: SkaffPluginModule;
  templateSettingsSchema?: TemplateSettingsSchemaInput;
  pluginName: string;
}): TemplateSettingsWarning | undefined {
  if (!templateSettingsSchema || !pluginModule.requiredTemplateSettingsSchema) {
    return undefined;
  }

  const compatibility = checkTemplateSettingsSchemaCompatibilityFromInput(
    templateSettingsSchema,
    pluginModule.requiredTemplateSettingsSchema,
  );

  if (compatibility.compatible) {
    return undefined;
  }

  return {
    module: pluginConfig.module,
    missingKeys: compatibility.missingKeys,
    optionalKeys: compatibility.optionalKeys,
    message: formatTemplateSettingsSchemaWarning(pluginName, compatibility),
  };
}

function coerceToJsonSchema(
  schema: TemplateSettingsSchemaInput,
): z.core.JSONSchema.BaseSchema {
  if (schema instanceof z.ZodType) {
    return z.toJSONSchema(schema);
  }

  return schema;
}

function getJsonSchemaInfo(schema: z.core.JSONSchema.BaseSchema): {
  properties: Set<string>;
  required: Set<string>;
} {
  if (!schema || typeof schema !== "object") {
    return { properties: new Set(), required: new Set() };
  }

  const schemaRecord = schema as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  const properties = new Set(Object.keys(schemaRecord.properties ?? {}));
  const required = new Set(
    Array.isArray(schemaRecord.required) ? schemaRecord.required : [],
  );
  return { properties, required };
}
