import type { TemplatePluginConfig } from "@timonteutelink/template-types-lib";

export const GREETER_PLUGIN_NAME = "greeter";

export type GreeterPluginOptions = {
  greeting?: string;
  audience?: "developer" | "ops";
};

export const greeterTemplatePluginSpecifier =
  "@timonteutelink/skaff-plugin-greeter" as const;
export const greeterCliPluginSpecifier =
  "@timonteutelink/skaff-plugin-greeter-cli" as const;
export const greeterWebPluginSpecifier =
  "@timonteutelink/skaff-plugin-greeter-web" as const;

export type GreeterTemplatePluginConfig = TemplatePluginConfig & {
  module: typeof greeterTemplatePluginSpecifier;
  options?: GreeterPluginOptions;
};

export type GreeterCliPluginConfig = TemplatePluginConfig & {
  module: typeof greeterCliPluginSpecifier;
};

export type GreeterWebPluginConfig = TemplatePluginConfig & {
  module: typeof greeterWebPluginSpecifier;
};

export function useGreeterTemplatePlugin(
  options?: GreeterPluginOptions,
): GreeterTemplatePluginConfig {
  return { module: greeterTemplatePluginSpecifier, options };
}

export function useGreeterPlugins(
  options?: GreeterPluginOptions,
): [
  GreeterTemplatePluginConfig,
  GreeterCliPluginConfig,
  GreeterWebPluginConfig,
] {
  return [
    useGreeterTemplatePlugin(options),
    { module: greeterCliPluginSpecifier },
    { module: greeterWebPluginSpecifier },
  ];
}
