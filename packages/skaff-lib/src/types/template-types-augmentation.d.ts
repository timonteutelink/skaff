export {};

declare module "@timonteutelink/template-types-lib" {
  export type TemplateParentReference = {
    templateName: string;
    repoUrl?: string;
    versionConstraint?: string;
  };

  interface TemplateConfigModule<
    TParentFinalSettings,
    TInputSettingsSchema,
    TFinalSettingsSchema,
    TAiResultsObject,
    TInputSettings,
    TFinalSettings
  > {
    possibleParentTemplates?: TemplateParentReference[];
  }
}
