import type { TemplatePluginConfig } from "@timonteutelink/template-types-lib";
import { z } from "zod";

export const ERD_PLUGIN_NAME = "erd";

const entityMetaSchema = z.object({
  updateAt: z.number(),
  createAt: z.number(),
});

const tableUiSchema = z.object({
  x: z.number(),
  y: z.number(),
  zIndex: z.number(),
  widthName: z.number(),
  widthComment: z.number(),
  color: z.string(),
});

const tableSchema = z.object({
  id: z.string(),
  name: z.string(),
  comment: z.string(),
  columnIds: z.array(z.string()),
  seqColumnIds: z.array(z.string()),
  ui: tableUiSchema,
  meta: entityMetaSchema,
});

const columnUiSchema = z.object({
  keys: z.number(),
  widthName: z.number(),
  widthComment: z.number(),
  widthDataType: z.number(),
  widthDefault: z.number(),
});

const columnSchema = z.object({
  id: z.string(),
  tableId: z.string(),
  name: z.string(),
  comment: z.string(),
  dataType: z.string(),
  default: z.string(),
  options: z.number(),
  ui: columnUiSchema,
  meta: entityMetaSchema,
});

const relationshipPointSchema = z.object({
  tableId: z.string(),
  columnIds: z.array(z.string()),
  x: z.number(),
  y: z.number(),
  direction: z.number(),
});

const relationshipSchema = z.object({
  id: z.string(),
  identification: z.boolean(),
  relationshipType: z.number(),
  startRelationshipType: z.number(),
  start: relationshipPointSchema,
  end: relationshipPointSchema,
  meta: entityMetaSchema,
});

const indexSchema = z.object({
  id: z.string(),
  name: z.string(),
  tableId: z.string(),
  indexColumnIds: z.array(z.string()),
  seqIndexColumnIds: z.array(z.string()),
  unique: z.boolean(),
  meta: entityMetaSchema,
});

const indexColumnSchema = z.object({
  id: z.string(),
  indexId: z.string(),
  columnId: z.string(),
  orderType: z.number(),
  meta: entityMetaSchema,
});

const memoUiSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  zIndex: z.number(),
  color: z.string(),
});

const memoSchema = z.object({
  id: z.string(),
  value: z.string(),
  ui: memoUiSchema,
  meta: entityMetaSchema,
});

const settingsSchema = z.object({
  width: z.number(),
  height: z.number(),
  scrollTop: z.number(),
  scrollLeft: z.number(),
  zoomLevel: z.number(),
  show: z.number(),
  database: z.number(),
  databaseName: z.string(),
  canvasType: z.string(),
  language: z.number(),
  tableNameCase: z.number(),
  columnNameCase: z.number(),
  bracketType: z.number(),
  relationshipDataTypeSync: z.boolean(),
  relationshipOptimization: z.boolean(),
  columnOrder: z.array(z.number()),
  maxWidthComment: z.number(),
  ignoreSaveSettings: z.number(),
});

const docSchema = z.object({
  tableIds: z.array(z.string()),
  relationshipIds: z.array(z.string()),
  indexIds: z.array(z.string()),
  memoIds: z.array(z.string()),
});

export const erdSchemaZod = z.object({
  $schema: z.literal(
    "https://raw.githubusercontent.com/dineug/erd-editor/main/json-schema/schema.json",
  ),
  version: z.literal("3.0.0"),
  settings: settingsSchema,
  doc: docSchema,
  collections: z.object({
    tableEntities: z.record(tableSchema),
    tableColumnEntities: z.record(columnSchema),
    relationshipEntities: z.record(relationshipSchema),
    indexEntities: z.record(indexSchema),
    indexColumnEntities: z.record(indexColumnSchema),
    memoEntities: z.record(memoSchema),
  }),
});

export type ErdSchema = z.infer<typeof erdSchemaZod>;

export type ErdTemplateSettings = Record<string, unknown>;

export type ErdTemplateMappers = {
  toErd: (settings: ErdTemplateSettings) => ErdSchema;
  fromErd: (erd: ErdSchema) => ErdTemplateSettings;
};

export type ErdPluginOptions = {
  mappers: ErdTemplateMappers;
};

export const erdTemplatePluginSpecifier =
  "@timonteutelink/skaff-plugin-erd" as const;

export type ErdTemplatePluginConfig = TemplatePluginConfig & {
  module: typeof erdTemplatePluginSpecifier;
  options: ErdPluginOptions;
};

export function useErdTemplatePlugin(
  mappers: ErdTemplateMappers,
): ErdTemplatePluginConfig {
  return { module: erdTemplatePluginSpecifier, options: { mappers } };
}
