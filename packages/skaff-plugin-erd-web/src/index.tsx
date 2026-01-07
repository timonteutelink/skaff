"use client";

import type {
  ErdEditorElement,
} from "@dineug/erd-editor";
import type {
  TemplateStageRenderProps,
  WebPluginContribution,
  WebPluginEntrypoint,
} from "@timonteutelink/skaff-lib";
import {
  mapErdToSettings,
  mapSettingsToErd,
} from "@timonteutelink/skaff-plugin-erd";
import type {
  ErdPluginOptions,
  ErdSchema,
  ErdTemplateMappers,
} from "@timonteutelink/skaff-plugin-erd-types";
import { erdSchemaZod } from "@timonteutelink/skaff-plugin-erd-types";
import * as React from "react";

const ERD_STAGE_ID = "erd-editor";

const ErdEditor = React.forwardRef<
  ErdEditorElement,
  React.HTMLAttributes<ErdEditorElement>
>((props, ref) => React.createElement("erd-editor", { ...props, ref }));

type ErdStageProps = TemplateStageRenderProps<ErdSchema | undefined> & {
  mappers?: ErdTemplateMappers;
};

function ErdStage({
  currentSettings,
  settingsDraft,
  setSettingsDraft,
  onContinue,
  setStageState,
  stageState,
  mappers,
}: ErdStageProps) {
  const editorRef = React.useRef<ErdEditorElement | null>(null);
  const hasInitializedRef = React.useRef(false);

  const settingsInput = React.useMemo(() => {
    if (settingsDraft && Object.keys(settingsDraft).length > 0) {
      return settingsDraft;
    }
    return currentSettings ?? {};
  }, [currentSettings, settingsDraft]);

  const erdInput = React.useMemo(() => {
    if (!mappers) {
      return null;
    }
    return mapSettingsToErd(settingsInput, mappers);
  }, [mappers, settingsInput]);

  const initialErdInput = React.useMemo(() => stageState ?? erdInput, [
    stageState,
    erdInput,
  ]);

  const serializedErdInput = React.useMemo(() => {
    if (!initialErdInput) {
      return null;
    }
    return JSON.stringify(initialErdInput);
  }, [initialErdInput]);

  React.useEffect(() => {
    void import("@dineug/erd-editor");
  }, []);

  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    editor.readonly = false;
    editor.systemDarkMode = true;
    editor.enableThemeBuilder = true;
  }, []);

  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !serializedErdInput || hasInitializedRef.current) {
      return;
    }
    editor.setInitialValue(serializedErdInput);
    hasInitializedRef.current = true;
    if (!stageState && initialErdInput) {
      setStageState(initialErdInput);
    }
  }, [initialErdInput, serializedErdInput, setStageState, stageState]);

  const handleContinue = React.useCallback(() => {
    const editor = editorRef.current;
    if (!editor || !mappers) {
      return;
    }
    const rawValue = editor.value || serializedErdInput;
    if (!rawValue) {
      return;
    }
    const nextErd = JSON.parse(rawValue) as ErdSchema;
    const nextSettings = mapErdToSettings(nextErd, mappers);
    setStageState(nextErd);
    setSettingsDraft(nextSettings);
    onContinue();
  }, [mappers, onContinue, serializedErdInput, setSettingsDraft, setStageState]);

  if (!mappers) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">ERD editor unavailable</h2>
        <p className="text-sm text-muted-foreground">
          This template did not provide ERD mapping functions. Please update the
          template configuration to include the ERD plugin mappers.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
        <ErdEditor
          ref={editorRef}
          className="block h-[70vh] w-full"
        />
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleContinue}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
        >
          Save and continue
        </button>
      </div>
    </div>
  );
}

const createErdWebContribution: WebPluginEntrypoint = (input) => {
  const options = input?.options as ErdPluginOptions | undefined;
  const mappers = options?.mappers;

  const templateStages: WebPluginContribution["templateStages"] = [
    {
      id: ERD_STAGE_ID,
      placement: "before-settings",
      stateSchema: erdSchemaZod.optional(),
      render: (props) => (
        <ErdStage
          {...(props as TemplateStageRenderProps<ErdSchema | undefined>)}
          mappers={mappers}
        />
      ),
    },
  ];

  return { templateStages };
};

const erdWebPlugin = {
  manifest: {
    name: "erd",
    version: "0.0.0",
    capabilities: ["web"],
    supportedHooks: { template: [], cli: [], web: [] },
  },
  web: createErdWebContribution,
};

export default erdWebPlugin;
