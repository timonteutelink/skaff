import { TemplateConfig } from "@timonteutelink/template-types-lib";

export interface TemplateDTO {
  dir: string;
  config: {
    templateConfig: TemplateConfig
    templateSettingsSchema: object;
  };
  templatesDir: string;
  subTemplates: Record<string, TemplateDTO[]>;
  refDir?: string;
}

