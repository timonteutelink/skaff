import type {
  CliPluginContribution,
  CliTemplateStage,
  PluginCliCommand,
} from "@timonteutelink/skaff-lib";
import {
  GREETER_PLUGIN_NAME,
  GREETER_STAGE_STATE_KEY,
} from "@timonteutelink/skaff-plugin-greeter-types";

type GreeterStageState = { disabled?: boolean };

const greeterCliCommand: PluginCliCommand = {
  name: "greet",
  description: "Print a friendly greeting and show persisted plugin state",
  async run({ argv, projectPath, projectSettings }) {
    const targetInstanceId =
      argv[0] ?? projectSettings.instantiatedTemplates[0]?.id;

    if (!targetInstanceId) {
      // eslint-disable-next-line no-console
      console.log("No template instances found to greet.");
      return;
    }

    const targetInstance = projectSettings.instantiatedTemplates.find(
      (entry) => entry.id === targetInstanceId,
    );

    const pluginState = targetInstance?.plugins?.[GREETER_PLUGIN_NAME];
    const persistedMessage = (pluginState?.settings as { message?: string } | undefined)
      ?.message;

    // eslint-disable-next-line no-console
    console.log(
      `👋 Hello from greeter for instance ${targetInstanceId} at ${
        projectPath ?? ""
      }.${persistedMessage ? ` Stored message: ${persistedMessage}` : ""}`,
    );
  },
};

const greeterCliBeforeStage: CliTemplateStage = {
  id: "greeter-cli-before",
  placement: "before-settings",
  stateKey: GREETER_STAGE_STATE_KEY,
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

const greeterCliAfterStage: CliTemplateStage = {
  id: "greeter-cli-after",
  placement: "after-settings",
  stateKey: GREETER_STAGE_STATE_KEY,
  shouldSkip: ({ stageState }) =>
    Boolean((stageState as GreeterStageState | undefined)?.disabled),
  async run({ currentSettings }) {
    // eslint-disable-next-line no-console
    console.log(`👋 hello ${JSON.stringify(currentSettings ?? {})}`);
  },
};

const greeterCliContribution: CliPluginContribution = {
  commands: [greeterCliCommand],
  templateStages: [greeterCliBeforeStage, greeterCliAfterStage],
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
