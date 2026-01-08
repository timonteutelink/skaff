import type {
  SkaffPluginModule,
  TemplateGenerationPlugin,
  TemplatePluginEntrypoint,
} from "@timonteutelink/skaff-lib";
import type {
  ErdPluginOptions,
  ErdSchema,
  ErdTemplateMappers,
  ErdTemplateSettings,
} from "@timonteutelink/skaff-plugin-erd-types";
import type { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { z } from "zod";
import { erdSchemaZod } from "@timonteutelink/skaff-plugin-erd-types";

const erdSchemaAny = erdSchemaZod as unknown as z.ZodTypeAny;

const erdMappersSchema = z.object({
  toErd: z.function().input([z.unknown()]).output(erdSchemaAny),
  fromErd: z
    .function()
    .input([erdSchemaAny])
    .output(z.record(z.string(), z.unknown())),
});

const erdPluginOptionsSchema = z.object({
  mappers: erdMappersSchema,
});

export type ErdPluginOptionsInput = z.input<typeof erdPluginOptionsSchema>;

export function validateErdInput(input: unknown): ErdSchema {
  return erdSchemaZod.parse(input);
}

export function validateMappedSettings(
  output: unknown,
  schema: z.ZodType<UserTemplateSettings>,
): UserTemplateSettings {
  return schema.parse(output);
}

export function mapSettingsToErd(
  settings: ErdTemplateSettings,
  mappers?: ErdTemplateMappers,
): ErdSchema {
  if (!mappers?.toErd) {
    throw new Error("ERD mapper 'toErd' is required to build ERD input.");
  }
  return validateErdInput(mappers.toErd(settings));
}

export function mapErdToSettings(
  erdInput: unknown,
  mappers?: ErdTemplateMappers,
  settingsSchema?: z.ZodType<UserTemplateSettings>,
): UserTemplateSettings {
  if (!mappers?.fromErd) {
    throw new Error("ERD mapper 'fromErd' is required to map settings.");
  }
  const erd = validateErdInput(erdInput);
  const settings = mappers.fromErd(erd) as UserTemplateSettings;
  if (settingsSchema) {
    return validateMappedSettings(settings, settingsSchema);
  }
  return settings;
}

const createErdTemplatePlugin: TemplatePluginEntrypoint = (input) => {
  const parsed = erdPluginOptionsSchema.safeParse(input.options ?? {});
  if (!parsed.success) {
    throw new Error(`Invalid ERD plugin options: ${parsed.error.message}`);
  }
  return {} satisfies TemplateGenerationPlugin;
};

const erdPlugin: SkaffPluginModule = {
  template: createErdTemplatePlugin,
};

export type { ErdPluginOptions };
export { erdSchemaZod };

export default erdPlugin;
