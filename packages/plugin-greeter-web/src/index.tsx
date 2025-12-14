import type {
  WebPluginContribution,
  WebTemplateStage,
} from "@timonteutelink/skaff-lib";
import React, { useState } from "react";
import {
  GREETER_PLUGIN_NAME,
  GREETER_STAGE_STATE_KEY,
} from "@timonteutelink/skaff-plugin-greeter-types";

type GreeterStageState = { disabled?: boolean };

const greeterBeforeWebStage: WebTemplateStage = {
  id: "greeter-before-settings",
  placement: "before-settings",
  stateKey: GREETER_STAGE_STATE_KEY,
  render: ({ onContinue, stageState, setStageState }) => {
    const [disabled, setDisabled] = useState(
      Boolean((stageState as GreeterStageState | undefined)?.disabled),
    );

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

const greeterAfterWebStage: WebTemplateStage = {
  id: "greeter-after-settings",
  placement: "after-settings",
  stateKey: GREETER_STAGE_STATE_KEY,
  shouldSkip: ({ stageState }) =>
    Boolean((stageState as GreeterStageState | undefined)?.disabled),
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
  getNotices: ({ projectSettings }) => {
    const instances = projectSettings.instantiatedTemplates.length;
    return [
      instances > 0
        ? `Greeter plugin ready for ${instances} template instance(s).`
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
