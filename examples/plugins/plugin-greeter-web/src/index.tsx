import type {
  WebPluginContribution,
  WebTemplateStage,
} from "@timonteutelink/skaff-lib";
import React, { useState } from "react";
import { GREETER_PLUGIN_NAME } from "../../plugin-greeter-types/src/index";

type GreeterStageState = { disabled?: boolean; message?: string };

const greeterInitWebStage: WebTemplateStage<GreeterStageState> = {
  id: "greeter-init",
  placement: "init",
  render: ({ onContinue, stageState, setStageState }) => {
    const [message, setMessage] = useState(
      typeof stageState?.message === "string"
        ? stageState.message
        : "Hello from greeter!",
    );

    return (
      <div className="space-y-4 p-6 border rounded-md bg-white">
        <h2 className="text-xl font-semibold">Greeter init</h2>
        <p className="text-muted-foreground">
          Provide the greeting message used by the greeter plugin.
        </p>
        <input
          type="text"
          className="w-full border rounded-md px-3 py-2"
          value={message}
          onChange={(event) => {
            const next = event.target.value;
            setMessage(next);
            setStageState({ message: next });
          }}
        />
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

const greeterFinalizeWebStage: WebTemplateStage<GreeterStageState> = {
  id: "greeter-finalize",
  placement: "finalize",
  render: ({ onContinue, currentSettings }) => (
    <div className="space-y-4 p-6 border rounded-md bg-white">
      <h2 className="text-xl font-semibold">Greeter finalize</h2>
      <p className="text-muted-foreground">
        Final settings: {JSON.stringify(currentSettings?.plugins ?? {})}
      </p>
      <button
        type="button"
        className="px-4 py-2 rounded-md bg-blue-600 text-white"
        onClick={onContinue}
      >
        Continue to diff
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
  templateStages: [
    greeterInitWebStage,
    greeterBeforeWebStage,
    greeterAfterWebStage,
    greeterFinalizeWebStage,
  ],
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
