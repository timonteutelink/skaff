import type React from "react";
import type {
  WebPluginContribution as BaseWebPluginContribution,
  WebTemplateStage as BaseWebTemplateStage,
} from "@timonteutelink/skaff-lib/browser";

export type WebTemplateStage<TState = unknown> = BaseWebTemplateStage<
  TState,
  React.ReactNode
>;

export type WebPluginContribution = Omit<
  BaseWebPluginContribution,
  "templateStages"
> & {
  templateStages?: WebTemplateStage[];
};
