import type {
  CliPluginContribution,
  CliTemplateStage,
  PluginCliCommand,
} from "@timonteutelink/skaff-lib";
import { GREETER_PLUGIN_NAME } from "../../plugin-greeter-types/src/index";

type GreeterStageState = { disabled?: boolean; message?: string };

const greeterCliCommand: PluginCliCommand = {
  name: "greet",
  alias: "g",
  description: "Print a friendly greeting and show plugin information",
  async run({ argv, projectPath, projectName, templateCount }) {
    const targetInstanceId = argv[0];

    // eslint-disable-next-line no-console
    console.log(
      `👋 Hello from greeter for project "${projectName}" at ${
        projectPath ?? "unknown path"
      }. ${templateCount} template(s) instantiated.${
        targetInstanceId ? ` Target instance: ${targetInstanceId}` : ""
      }`,
    );
  },
};

const greeterCliBeforeStage: CliTemplateStage<GreeterStageState> = {
  id: "greeter-cli-before",
  placement: "before-settings",
  async run({ prompts, setStageState }) {
    // eslint-disable-next-line no-console
    console.log("👋 hello from the greeter plugin before settings");
    const disable = await prompts.confirm({
      default: false,
      message: "Skip the greeter after-settings stage?",
    });
    setStageState({ disabled: disable });
  },
};

const greeterCliInitStage: CliTemplateStage<GreeterStageState> = {
  id: "greeter-cli-init",
  placement: "init",
  async run({ prompts, setStageState }) {
    const message = await prompts.input({
      message: "Enter a greeting message for the greeter plugin",
      default: "Hello from greeter!",
    });
    setStageState({ message });
    return {
      plugins: {
        [GREETER_PLUGIN_NAME]: {
          message,
        },
      },
    };
  },
};

const greeterCliAfterStage: CliTemplateStage<GreeterStageState> = {
  id: "greeter-cli-after",
  placement: "after-settings",
  shouldSkip: ({ stageState }) => Boolean(stageState?.disabled),
  async run({ currentSettings }) {
    // eslint-disable-next-line no-console
    console.log(`👋 hello ${JSON.stringify(currentSettings ?? {})}`);
  },
};

const greeterCliFinalizeStage: CliTemplateStage<GreeterStageState> = {
  id: "greeter-cli-finalize",
  placement: "finalize",
  async run({ currentSettings }) {
    // eslint-disable-next-line no-console
    console.log(
      `👋 finalize: ${JSON.stringify(currentSettings?.plugins ?? {})}`,
    );
  },
};

const greeterCliContribution: CliPluginContribution = {
  commands: [greeterCliCommand],
  templateStages: [
    greeterCliInitStage,
    greeterCliBeforeStage,
    greeterCliAfterStage,
    greeterCliFinalizeStage,
  ],
};

const greeterCliPlugin = {
  manifest: {
    name: GREETER_PLUGIN_NAME,
    version: "0.0.0",
    capabilities: ["cli"],
    supportedHooks: { template: [], cli: [], web: [] },
  },
  cli: greeterCliContribution,
};

export default greeterCliPlugin;
