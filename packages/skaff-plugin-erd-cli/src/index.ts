import type {
  CliPluginContribution,
  CliTemplateStage,
  UiPluginFactoryInput,
} from "@timonteutelink/skaff-lib";
import {
  mapErdToSettings,
  validateErdInput,
} from "@timonteutelink/skaff-plugin-erd";
import type {
  ErdPluginOptions,
  ErdSchema,
} from "@timonteutelink/skaff-plugin-erd-types";

type InquirerPrompts = typeof import("@inquirer/prompts");

const ERD_INPUT_IDS = ["erd", "erdSchema"] as const;

type ErdStageState = ErdSchema | null;

async function promptForErdSchema(
  prompts: InquirerPrompts,
): Promise<ErdSchema> {
  const useFile = await prompts.confirm({
    message: "Load ERD schema from a file path?",
    default: true,
  });

  if (useFile) {
    const filePath = await prompts.input({
      message: "Enter the ERD schema file path",
      validate: (value) =>
        value.trim().length > 0 || "File path is required.",
    });
    const fileContents = await prompts.input({
      message: `Paste the ERD JSON from "${filePath}"`,
      validate: (value) =>
        value.trim().length > 0 || "ERD JSON is required.",
    });
    return validateErdInput(JSON.parse(fileContents));
  }

  const inlineJson = await prompts.input({
    message: "Paste the ERD schema JSON",
    validate: (value) => value.trim().length > 0 || "ERD JSON is required.",
  });
  return validateErdInput(JSON.parse(inlineJson));
}

function createErdCliStage(
  options: ErdPluginOptions | undefined,
): CliTemplateStage<ErdStageState, InquirerPrompts> {
  return {
    id: "erd-cli-before",
    placement: "before-settings",
    async run({ prompts, setStageState }) {
      const mappers = options?.mappers;
      if (!mappers) {
        // eslint-disable-next-line no-console
        console.warn(
          "ERD plugin mappers are missing. Update the template config to enable ERD input.",
        );
        return;
      }
      const erdSchema = await promptForErdSchema(prompts);
      const mappedSettings = mapErdToSettings(erdSchema, mappers);
      setStageState(erdSchema);
      return mappedSettings;
    },
  };
}

const createErdCliContribution = (input?: UiPluginFactoryInput) => {
  const options = input?.options as ErdPluginOptions | undefined;

  const cliContribution: CliPluginContribution<InquirerPrompts> = {
    inputSources: ERD_INPUT_IDS.map((id) => ({
      id,
      description: "ERD schema JSON input (inline JSON or @file via CLI flag).",
    })),
    templateStages: [createErdCliStage(options)],
  };

  return cliContribution;
};

const erdCliPlugin = {
  cli: createErdCliContribution,
};

export default erdCliPlugin;
