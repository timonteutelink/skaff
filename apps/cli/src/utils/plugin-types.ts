import type * as prompts from "@inquirer/prompts";
import type {
  CliPluginContribution as BaseCliPluginContribution,
  CliTemplateStage as BaseCliTemplateStage,
} from "@timonteutelink/skaff-lib";

export type CliTemplateStage<TState = unknown> = BaseCliTemplateStage<
  TState,
  typeof prompts
>;

export type CliPluginContribution = BaseCliPluginContribution<typeof prompts>;
