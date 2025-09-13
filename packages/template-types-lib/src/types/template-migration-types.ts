import { z } from "zod";

export const templateSettingsMigrationSchema = z.object({
  id: z.string().uuid(),
  migrate: z
    .function()
    .args(z.record(z.any()))
    .returns(z.record(z.any())),
});

export type TemplateSettingsMigration = z.infer<typeof templateSettingsMigrationSchema>;
