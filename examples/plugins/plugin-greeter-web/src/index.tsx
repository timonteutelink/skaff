import type {
  WebPluginContribution,
  WebTemplateStage,
} from "@timonteutelink/skaff-lib";
import React, { useState } from "react";
import { GREETER_PLUGIN_NAME } from "@timonteutelink/skaff-plugin-greeter-types";

type GreeterStageState = { disabled?: boolean };

const greeterBeforeWebStage: WebTemplateStage<GreeterStageState> = {
  id: "greeter-before-settings",
  placement: "before-settings",
  render: ({ onContinue, stageState, setStageState }) => {
    const [disabled, setDisabled] = useState(Boolean(stageState?.disabled));

    return (
      <div className="space-y-4 p-6 border rounded-md bg-white">
        <h2 className="text-xl font-semibold">Greeter hello page</h2>
        <p className="text-muted-foreground">Hello</p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={disabled}
            onChange={(event) => {
              const next = event.target.checked;
              setDisabled(next);
              setStageState({ disabled: next });
            }}
          />
          <span>Skip the post-settings greeting</span>
        </label>
        <button
          type="button"
          className="px-4 py-2 rounded-md bg-blue-600 text-white"
          onClick={onContinue}
        >
          Continue
        </button>
      </div>
    );
  },
};

const greeterAfterWebStage: WebTemplateStage<GreeterStageState> = {
  id: "greeter-after-settings",
  placement: "after-settings",
  shouldSkip: ({ stageState }) => Boolean(stageState?.disabled),
  render: ({ currentSettings, onContinue }) => (
    <div className="space-y-4 p-6 border rounded-md bg-white">
      <h2 className="text-xl font-semibold">Greeter after settings</h2>
      <p className="text-muted-foreground">
        {`hello ${JSON.stringify(currentSettings ?? {})}`}
      </p>
      <button
        type="button"
        className="px-4 py-2 rounded-md bg-blue-600 text-white"
        onClick={onContinue}
      >
        Continue to template generation
      </button>
    </div>
  ),
};

const greeterWebContribution: WebPluginContribution = {
  getNotices: ({ templateCount }) => {
    return [
      templateCount > 0
        ? `Greeter plugin ready for ${templateCount} template instance(s).`
        : "Greeter plugin is ready to welcome you in the UI.",
    ];
  },
  templateStages: [greeterBeforeWebStage, greeterAfterWebStage],
};

const greeterWebPlugin = {
  manifest: {
    name: GREETER_PLUGIN_NAME,
    version: "0.0.0",
    capabilities: ["web"],
    supportedHooks: { template: [], cli: [], web: [] },
  },
  web: greeterWebContribution,
};

export default greeterWebPlugin;
