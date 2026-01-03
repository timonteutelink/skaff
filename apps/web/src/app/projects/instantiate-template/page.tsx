"use client";
import { commitChanges } from "@/app/actions/git";
import {
  applyTemplateDiffToProject,
  cancelProjectCreation,
  createNewProject,
  generateProjectFromProjectSettings,
  prepareTemplateInstantiationDiff,
  prepareTemplateModificationDiff,
  resolveConflictsAndDiff,
  restoreAllChangesToCleanProject,
  retrieveDiffUpdateProjectNewTemplateRevision,
} from "@/app/actions/instantiate";
import { retrieveProject } from "@/app/actions/project";
import {
  retrieveTemplate,
  retrieveTemplateRevisionForProject,
} from "@/app/actions/template";
import { retrieveAllPluginSettings } from "@/app/actions/plugin-settings";
import CommitButton from "@/components/general/git/commit-dialog";
import { DiffVisualizerPage } from "@/components/general/git/diff-visualizer-page";
import { TemplateSettingsForm } from "@/components/general/template-settings/template-settings-form";
import { Button } from "@/components/ui/button";
import {
  TemplateSummary,
  NewTemplateDiffResult,
  ParsedFile,
  ProjectDTO,
  Result,
  TemplateDTO,
  findTemplate,
} from "@timonteutelink/skaff-lib/browser";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toastNullError } from "@/lib/utils";
import {
  FileUploadDialog,
  JsonFile,
} from "@/components/general/file-upload-dialog";
import { ConfirmationDialog } from "@/components/general/confirmation-dialog";
import {
  loadWebTemplateStages,
  loadWebTemplatePluginRequirements,
  checkPluginCompatibility,
  type WebPluginStageEntry,
  type WebPluginRequirement,
  type PluginCompatibilityResult,
} from "@/lib/plugins/web-stage-loader";
import { PluginCompatibilityDetails } from "@/components/general/plugins/plugin-compatibility";
import {
  buildSchemaAndDefaults,
  normalizeNativeSchemaNode,
} from "@/components/general/template-settings/schema-utils";

// TODO: when updating to a new template version we should reiterate all settings of all templates for possible changes. Or we fully automate go directly to diff but require the template to setup sensible defaults for possible new options.

// TODO: add lot more checks on backend. For example cannot edit autoinstantiated template.
// TODO add another flow for instantiating full project from projectSettings.
const TemplateInstantiationPage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectRepositoryNameParam = useMemo(
    () => searchParams.get("projectRepositoryName"),
    [searchParams],
  );
  const templateNameParam = useMemo(
    () => searchParams.get("template"),
    [searchParams],
  );
  const parentTemplateInstanceIdParam = useMemo(
    () => searchParams.get("parentTemplateInstanceId"),
    [searchParams],
  );
  const selectedDirectoryIdParam = useMemo(
    () => searchParams.get("selectedProjectDirectoryId"),
    [searchParams],
  );
  const existingTemplateInstanceIdParam = useMemo(
    () => searchParams.get("existingTemplateInstanceId"),
    [searchParams],
  );
  const newRevisionHashParam = useMemo(
    () => searchParams.get("newRevisionHash"),
    [searchParams],
  );
  const templateInstanceIdParam = useMemo(
    () => searchParams.get("templateInstanceId"),
    [searchParams],
  );
  const [project, setProject] = useState<ProjectDTO>();
  const [rootTemplate, setRootTemplate] = useState<TemplateDTO>();
  const [diffToApply, setDiffToApply] = useState<NewTemplateDiffResult | null>(
    null,
  );
  const [appliedDiff, setAppliedDiff] = useState<ParsedFile[] | null>(null);
  const [storedFormData, setStoredFormData] =
    useState<UserTemplateSettings | null>(null);
  const [settingsDraft, setSettingsDraft] =
    useState<UserTemplateSettings | null>(null);
  const [pluginStages, setPluginStages] = useState<WebPluginStageEntry[]>([]);
  const [pluginRequirements, setPluginRequirements] = useState<
    WebPluginRequirement[]
  >([]);
  const [pluginCompatibility, setPluginCompatibility] =
    useState<PluginCompatibilityResult | null>(null);
  const [pluginSettings, setPluginSettings] = useState<
    Record<string, unknown> | null
  >(null);
  const [stageState, setStageState] = useState<Record<string, unknown>>({});
  const [beforeStageIndex, setBeforeStageIndex] = useState(0);
  const [afterStageIndex, setAfterStageIndex] = useState(0);
  const [initStageIndex, setInitStageIndex] = useState(0);
  const [finalizeStageIndex, setFinalizeStageIndex] = useState(0);
  const [flowPhase, setFlowPhase] = useState<
    "init" | "before" | "form" | "after" | "finalize"
  >("before");
  const [pendingSettings, setPendingSettings] =
    useState<UserTemplateSettings | null>(null);
  const [pendingFinalizeSettings, setPendingFinalizeSettings] =
    useState<UserTemplateSettings | null>(null);

  useEffect(() => {
    if (!projectRepositoryNameParam) {
      toastNullError({
        shortMessage: "Project repository name not provided in search params.",
      });
      router.push("/projects");
      return;
    }
    if (!newRevisionHashParam && !templateNameParam) {
      toastNullError({
        shortMessage: "Template name not provided in search params.",
      });
      router.push("/projects");
      return;
    }
    const providedModes = [
      selectedDirectoryIdParam,
      parentTemplateInstanceIdParam,
      existingTemplateInstanceIdParam,
      newRevisionHashParam,
    ].filter(Boolean).length;

    if (newRevisionHashParam && !templateInstanceIdParam) {
      toastNullError({
        shortMessage:
          "Template instance ID is required when updating to a new revision hash.",
      });
      router.push("/projects");
      return;
    }

    if (!newRevisionHashParam && templateInstanceIdParam) {
      toastNullError({
        shortMessage:
          "Template instance ID can only be provided when updating to a new revision hash.",
      });
      router.push("/projects");
      return;
    }

    if (
      providedModes !== 1 ||
      (selectedDirectoryIdParam && templateInstanceIdParam) ||
      (parentTemplateInstanceIdParam && templateInstanceIdParam) ||
      (existingTemplateInstanceIdParam && templateInstanceIdParam)
    ) {
      toastNullError({
        shortMessage: "Provide exactly one instantiation mode.",
      });
      router.push("/projects");
      return;
    }

    const retrieveStuff = async () => {
      let projectResult;
      let revisionResult;
      if (selectedDirectoryIdParam) {
        revisionResult = await retrieveTemplate(templateNameParam!);
      } else {
        [projectResult, revisionResult] = await Promise.all([
          retrieveProject(projectRepositoryNameParam),
          retrieveTemplateRevisionForProject(projectRepositoryNameParam),
        ]);
      }

      const revision = toastNullError({
        result: revisionResult as Result<TemplateSummary | TemplateDTO | null>,
        shortMessage: "Error retrieving template.",
        nullErrorMessage: `Template not found for project: ${projectRepositoryNameParam}`,
        nullRedirectPath: "/projects",
        router,
      });

      if (!revision) {
        return;
      }

      if ("template" in revision) {
        const template = revision.template;
        if (!template) {
          toastNullError({
            shortMessage: "Template not found in revision data.",
          });
          return;
        }
        setRootTemplate(template);
        return;
      }

      setRootTemplate(revision);

      if (selectedDirectoryIdParam) {
        return;
      }

      const project = toastNullError({
        result: projectResult,
        shortMessage: "Error retrieving project.",
      });
      if (!project) {
        if (!selectedDirectoryIdParam) {
          toastNullError({
            shortMessage: `Project not found: ${projectRepositoryNameParam}`,
          });
          router.push("/projects");
        }
        return;
      }
      if (project.settings.instantiatedTemplates.length === 0) {
        toastNullError({
          shortMessage: "No instantiated templates found in project.",
        });
        router.push("/projects");
        return;
      }

      setProject(project);

      if (!newRevisionHashParam) {
        return;
      }
      const newRevisionResult =
        await retrieveDiffUpdateProjectNewTemplateRevision(
          projectRepositoryNameParam,
          newRevisionHashParam,
          templateInstanceIdParam!,
        );
      const newRevision = toastNullError({
        result: newRevisionResult,
        shortMessage: "Error retrieving template.",
      });
      if (!newRevision) {
        return;
      }
      setDiffToApply(newRevision);
    };
    retrieveStuff();
  }, [
    projectRepositoryNameParam,
    router,
    templateNameParam,
    parentTemplateInstanceIdParam,
    selectedDirectoryIdParam,
    existingTemplateInstanceIdParam,
    newRevisionHashParam,
    templateInstanceIdParam,
  ]);

  useEffect(() => {
    retrieveAllPluginSettings().then((settingsResult) => {
      const settings = toastNullError({
        result: settingsResult,
        shortMessage: "Error retrieving plugin settings",
      });
      setPluginSettings(settings ?? {});
    });
  }, []);

  const subTemplate = useMemo(() => {
    if (!rootTemplate || !templateNameParam) {
      return null;
    }
    return findTemplate(rootTemplate, templateNameParam);
  }, [rootTemplate, templateNameParam]);

  useEffect(() => {
    let canceled = false;
    if (!subTemplate || "error" in subTemplate || !subTemplate.data) {
      setPluginStages([]);
      setPluginRequirements([]);
      setPluginCompatibility(null);
      setStageState({});
      setFlowPhase("form");
      return;
    }

    if (pluginSettings === null) {
      setPluginCompatibility(null);
      setPluginStages([]);
      setPluginRequirements([]);
      setStageState({});
      setFlowPhase("form");
      return;
    }

    const compatibility = checkPluginCompatibility(
      subTemplate.data,
      pluginSettings,
    );
    setPluginCompatibility(compatibility);
    if (!compatibility.compatible) {
      setPluginStages([]);
      setPluginRequirements([]);
      setStageState({});
      setFlowPhase("form");
      return;
    }

    const projectContext = {
      projectRepositoryName: projectRepositoryNameParam ?? "",
      projectAuthor: project?.settings.projectAuthor ?? "",
      rootTemplateName:
        rootTemplate?.config.templateConfig.name ?? templateNameParam ?? "",
    };

    Promise.all([
      loadWebTemplateStages(subTemplate.data, projectContext, pluginSettings),
      loadWebTemplatePluginRequirements(subTemplate.data, pluginSettings),
    ]).then(([stages, requirements]) => {
      if (canceled) return;
      setPluginStages(stages);
      setStageState({});
      setBeforeStageIndex(0);
      setAfterStageIndex(0);
      setInitStageIndex(0);
      setFinalizeStageIndex(0);
      setFlowPhase("init");
    });

    return () => {
      canceled = true;
    };
  }, [
    subTemplate,
    projectRepositoryNameParam,
    project?.settings.projectAuthor,
    rootTemplate?.config.templateConfig.name,
    templateNameParam,
    pluginSettings,
  ]);

  // Now use entry.stateKey directly since it's pre-computed with proper namespacing
  const getStageKey = useCallback(
    (entry: WebPluginStageEntry) => entry.stateKey,
    [],
  );

  const beforeStages = useMemo(
    () =>
      pluginStages.filter(
        (entry) => entry.stage.placement === "before-settings",
      ),
    [pluginStages],
  );
  const initStages = useMemo(
    () => pluginStages.filter((entry) => entry.stage.placement === "init"),
    [pluginStages],
  );
  const afterStages = useMemo(
    () =>
      pluginStages.filter(
        (entry) => entry.stage.placement === "after-settings",
      ),
    [pluginStages],
  );
  const finalizeStages = useMemo(
    () => pluginStages.filter((entry) => entry.stage.placement === "finalize"),
    [pluginStages],
  );

  const buildStageContext = useCallback(
    (
      entry: WebPluginStageEntry,
      currentSettings: UserTemplateSettings | null,
    ) => ({
      templateName: templateNameParam ?? "",
      projectRepositoryName: projectRepositoryNameParam ?? undefined,
      currentSettings,
      settingsDraft,
      stageState: stageState[getStageKey(entry)],
    }),
    [
      projectRepositoryNameParam,
      getStageKey,
      settingsDraft,
      stageState,
      templateNameParam,
    ],
  );

  const updateStageState = useCallback((key: string, value: unknown) => {
    setStageState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const baseTemplateSettingsDefaultValues: Record<string, any> = useMemo(() => {
    if (storedFormData && Object.keys(storedFormData).length > 0) {
      return storedFormData;
    }

    if (
      !subTemplate ||
      !project ||
      !existingTemplateInstanceIdParam ||
      "error" in subTemplate ||
      !subTemplate.data
    ) {
      return {};
    }

    const instantiatedSettings =
      project.settings.instantiatedTemplates.find(
        (t) =>
          t.id === existingTemplateInstanceIdParam &&
          t.templateName === subTemplate.data?.config.templateConfig.name,
      )?.templateSettings || {};

    return instantiatedSettings;
  }, [subTemplate, project, existingTemplateInstanceIdParam, storedFormData]);

  const stageInitialSettings = useMemo(() => {
    if (settingsDraft && Object.keys(settingsDraft).length > 0) {
      return settingsDraft;
    }
    if (
      existingTemplateInstanceIdParam &&
      Object.keys(baseTemplateSettingsDefaultValues).length > 0
    ) {
      return baseTemplateSettingsDefaultValues;
    }
    return storedFormData;
  }, [
    baseTemplateSettingsDefaultValues,
    existingTemplateInstanceIdParam,
    settingsDraft,
    storedFormData,
  ]);

  const readonlyStageSettings = useMemo(() => {
    if (!stageInitialSettings) return null;
    return Object.freeze({ ...stageInitialSettings });
  }, [stageInitialSettings]);

  const ensureBeforeStage = useCallback(
    async (startIndex = 0) => {
      let cursor = startIndex;
      while (cursor < beforeStages.length) {
        const entry = beforeStages[cursor]!;
        const context = buildStageContext(entry, readonlyStageSettings);
        const skip = await entry.stage.shouldSkip?.(context);

        if (!skip) {
          setBeforeStageIndex(cursor);
          setFlowPhase("before");
          return;
        }
        cursor += 1;
      }
      setFlowPhase("form");
    },
    [beforeStages, buildStageContext, readonlyStageSettings],
  );

  const ensureInitStage = useCallback(
    async (startIndex = 0) => {
      let cursor = startIndex;
      while (cursor < initStages.length) {
        const entry = initStages[cursor]!;
        const context = buildStageContext(entry, readonlyStageSettings);
        const skip = await entry.stage.shouldSkip?.(context);

        if (!skip) {
          setInitStageIndex(cursor);
          setFlowPhase("init");
          return;
        }
        cursor += 1;
      }
      await ensureBeforeStage(0);
    },
    [initStages, buildStageContext, ensureBeforeStage, readonlyStageSettings],
  );

  useEffect(() => {
    void ensureInitStage(0);
  }, [ensureInitStage]);

  const mergeDraftSettings = useCallback(
    (settings: UserTemplateSettings) => ({
      ...(settingsDraft ?? {}),
      ...settings,
    }),
    [settingsDraft],
  );

  const ensureFinalizeStage = useCallback(
    async (startIndex: number, settings: UserTemplateSettings) => {
      let cursor = startIndex;
      while (cursor < finalizeStages.length) {
        const entry = finalizeStages[cursor]!;
        const context = buildStageContext(entry, settings);
        const skip = await entry.stage.shouldSkip?.(context);

        if (!skip) {
          setFinalizeStageIndex(cursor);
          setFlowPhase("finalize");
          return;
        }
        cursor += 1;
      }

      setPendingFinalizeSettings(null);
      setFlowPhase("form");
    },
    [finalizeStages, buildStageContext],
  );

  const startFinalizeStages = useCallback(
    async (settings: UserTemplateSettings) => {
      if (!finalizeStages.length) {
        setFlowPhase("form");
        return;
      }

      setPendingFinalizeSettings(settings);
      await ensureFinalizeStage(0, settings);
    },
    [finalizeStages, ensureFinalizeStage],
  );

  const processSettingsSubmission = useCallback(
    async (data: UserTemplateSettings) => {
      if (
        !projectRepositoryNameParam ||
        !templateNameParam ||
        !rootTemplate ||
        !subTemplate
      ) {
        toastNullError({
          shortMessage: "Project repository name or template name not found.",
        });
        return;
      }

      const mergedSettings = mergeDraftSettings(data);
      setStoredFormData(mergedSettings);
      if (selectedDirectoryIdParam) {
        const newProjectResult = await createNewProject(
          projectRepositoryNameParam,
          templateNameParam,
          selectedDirectoryIdParam,
          mergedSettings,
        );

        const newProject = toastNullError({
          result: newProjectResult,
          shortMessage: "Error creating project.",
        });

        if (!newProject) {
          return;
        }

        setAppliedDiff(newProject.diff || null);
      } else if (parentTemplateInstanceIdParam) {
        if (!project) {
          toastNullError({
            shortMessage: "Project not found.",
          });
          return;
        }

        if (
          project.settings.projectRepositoryName !== projectRepositoryNameParam
        ) {
          toastNullError({
            shortMessage: "Project repository name does not match.",
          });
          return;
        }

        const subTemplateValue = toastNullError({
          result: subTemplate,
          shortMessage: "Error finding sub-template.",
          nullErrorMessage: "Sub-template not found.",
        });

        if (!subTemplateValue) {
          return;
        }

        if (
          subTemplateValue.config.templateConfig.name ===
          rootTemplate.config.templateConfig.name
        ) {
          toastNullError({
            shortMessage:
              "Root template cannot be instantiated as a sub-template.",
          });
          return;
        }

        const templateInstantiationResult =
          await prepareTemplateInstantiationDiff(
            rootTemplate.config.templateConfig.name,
            subTemplateValue.config.templateConfig.name,
            parentTemplateInstanceIdParam!,
            projectRepositoryNameParam,
            mergedSettings,
          );

        const result = toastNullError({
          result: templateInstantiationResult,
          shortMessage: "Error instantiating template.",
        });

        if (!result) {
          return;
        }

        setDiffToApply(result);
      } else if (existingTemplateInstanceIdParam) {
        if (!project) {
          toastNullError({
            shortMessage: `Project not found: ${projectRepositoryNameParam}`,
          });
          return;
        }

        if (
          project.settings.projectRepositoryName !== projectRepositoryNameParam
        ) {
          toastNullError({
            shortMessage: "Project repository name does not match.",
          });
          return;
        }

        const subTemplateValue = toastNullError({
          result: subTemplate,
          shortMessage: "Error finding sub-template.",
          nullErrorMessage: "Sub-template not found.",
        });
        if (!subTemplateValue) {
          return;
        }

        const templateModificationResult =
          await prepareTemplateModificationDiff(
            mergedSettings,
            projectRepositoryNameParam,
            existingTemplateInstanceIdParam,
          );

        const templateModification = toastNullError({
          result: templateModificationResult,
          shortMessage: "Error instantiating template.",
        });
        if (!templateModification) {
          return;
        }

        setDiffToApply(templateModification);
      } else {
        toastNullError({
          shortMessage:
            "No parent template instance ID or selected directory ID provided.",
        });
        return;
      }

      await startFinalizeStages(mergedSettings);
    },
    [
      mergeDraftSettings,
      projectRepositoryNameParam,
      rootTemplate,
      subTemplate,
      parentTemplateInstanceIdParam,
      selectedDirectoryIdParam,
      templateNameParam,
      project,
      existingTemplateInstanceIdParam,
      startFinalizeStages,
    ],
  );

  const ensureAfterStage = useCallback(
    async (startIndex: number, settings: UserTemplateSettings) => {
      let cursor = startIndex;
      while (cursor < afterStages.length) {
        const entry = afterStages[cursor]!;
        const context = buildStageContext(entry, settings);
        const skip = await entry.stage.shouldSkip?.(context);

        if (!skip) {
          setAfterStageIndex(cursor);
          setFlowPhase("after");
          return;
        }

        cursor += 1;
      }

      setPendingSettings(null);
      setFlowPhase("form");
      await processSettingsSubmission(settings);
    },
    [afterStages, buildStageContext, processSettingsSubmission],
  );

  const startAfterStages = useCallback(
    async (data: UserTemplateSettings) => {
      setStoredFormData(data);
      setPendingSettings(data);

      if (afterStages.length === 0) {
        await processSettingsSubmission(data);
        setPendingSettings(null);
        return;
      }

      await ensureAfterStage(0, data);
    },
    [afterStages, ensureAfterStage, processSettingsSubmission],
  );

  const normalizedSettingsSchema = useMemo(() => {
    if (!subTemplate || "error" in subTemplate || !subTemplate.data) {
      return null;
    }
    return normalizeNativeSchemaNode(
      subTemplate.data.config.templateSettingsSchema,
    );
  }, [subTemplate]);

  const settingsDraftSchema = useMemo(() => {
    if (!normalizedSettingsSchema?.properties) return null;
    const { schema } = buildSchemaAndDefaults(normalizedSettingsSchema);
    return schema;
  }, [normalizedSettingsSchema]);

  const setDraftAndDefaults = useCallback(
    (next: UserTemplateSettings | null) => {
      setSettingsDraft(next);
      setStoredFormData(next);
    },
    [],
  );

  const validateSettingsDraft = useCallback(() => {
    if (!settingsDraft || !settingsDraftSchema) return true;
    const parsed = settingsDraftSchema.safeParse(settingsDraft);
    if (!parsed.success) {
      toastNullError({
        shortMessage: "Draft template settings are invalid.",
        error: parsed.error,
      });
      return false;
    }
    return true;
  }, [settingsDraft, settingsDraftSchema]);

  const handleBeforeContinue = useCallback(() => {
    if (!validateSettingsDraft()) {
      return;
    }
    void ensureBeforeStage(beforeStageIndex + 1);
  }, [beforeStageIndex, ensureBeforeStage, validateSettingsDraft]);

  const handleInitContinue = useCallback(() => {
    if (!validateSettingsDraft()) {
      return;
    }
    void ensureInitStage(initStageIndex + 1);
  }, [initStageIndex, ensureInitStage, validateSettingsDraft]);

  const handleAfterContinue = useCallback(() => {
    if (!pendingSettings) return;
    void ensureAfterStage(afterStageIndex + 1, pendingSettings);
  }, [afterStageIndex, ensureAfterStage, pendingSettings]);

  const handleFinalizeContinue = useCallback(() => {
    if (!pendingFinalizeSettings) return;
    void ensureFinalizeStage(
      finalizeStageIndex + 1,
      pendingFinalizeSettings,
    );
  }, [finalizeStageIndex, ensureFinalizeStage, pendingFinalizeSettings]);

  const handleConfirmAppliedDiff = useCallback(
    async (commitMessage: string) => {
      if (!projectRepositoryNameParam || !commitMessage) {
        toastNullError({
          shortMessage: "Project repository name or commit message not found.",
        });
        return;
      }
      if (!commitMessage) {
        toastNullError({
          shortMessage: "Commit message is required.",
        });
        return;
      }

      const commitResult = await commitChanges(
        projectRepositoryNameParam,
        commitMessage,
      );

      const commit = toastNullError({
        result: commitResult,
        shortMessage: "Error committing changes.",
      });

      if (commit === false) {
        return;
      }
      router.push(
        `/projects/project/?projectRepositoryName=${projectRepositoryNameParam}`,
      );
    },
    [router, projectRepositoryNameParam],
  );

  const handleUploadProjectSettings = useCallback(
    async (jsons: JsonFile[]): Promise<Result<void>> => {
      if (
        !templateNameParam ||
        !selectedDirectoryIdParam ||
        !projectRepositoryNameParam
      ) {
        toastNullError({
          shortMessage:
            "Not creating a project. 'template' or 'selectedDirectoryId' or 'projectRepositoryName' is missing.",
        });
        return { data: undefined };
      }
      const projectSettingsJson = jsons[0]!;

      try {
        const parsedProjectSettings = JSON.parse(projectSettingsJson.text);

        if (parsedProjectSettings.rootTemplateName !== templateNameParam) {
          toastNullError({
            shortMessage:
              "The template selected in the previous step does not match the root template in the uploaded project settings",
          });
          return {
            error:
              "The template selected in the previous step does not match the root template in the uploaded project settings",
          };
        }
      } catch (error) {
        toastNullError({
          error,
          shortMessage:
            "Error occured parsing the loaded project settings json",
        });
        return {
          error: "Error occured parsing the loaded project settings json",
        };
      }

      const newProjectResult = await generateProjectFromProjectSettings(
        projectSettingsJson.text,
        selectedDirectoryIdParam,
        projectRepositoryNameParam,
      );

      const newProject = toastNullError({
        result: newProjectResult,
        shortMessage: "Error creating project.",
      });

      if (!newProject) {
        return { error: "Project creating failed" };
      }

      setAppliedDiff(newProject.diff || null);
      return { data: undefined };
    },
    [projectRepositoryNameParam, selectedDirectoryIdParam, templateNameParam],
  );

  const handleSubmitDiffToApply = useCallback(async () => {
    if (!projectRepositoryNameParam) {
      toastNullError({
        shortMessage: "Project repository name not found.",
      });
      return;
    }
    if (!diffToApply) {
      toastNullError({
        shortMessage: "Diff to apply is null.",
      });
      return;
    }
    if (selectedDirectoryIdParam) {
      toastNullError({
        shortMessage: "Diff to apply should not be shown.",
      });
      return;
    }

    const applyDiffResult = await applyTemplateDiffToProject(
      projectRepositoryNameParam,
      diffToApply.diffHash,
    );

    const applyDiff = toastNullError({
      result: applyDiffResult,
      shortMessage: "Error applying diff.",
    });

    if (!applyDiff) {
      return;
    }

    let diff: ParsedFile[];
    if ("resolveBeforeContinuing" in applyDiff) {
      const userConfirmed = confirm(
        "There are conflicts in the diff. Please resolve them and press 'OK' to continue.",
      );
      if (!userConfirmed) {
        return;
      }

      const resolveResult = await resolveConflictsAndDiff(
        projectRepositoryNameParam,
      );

      const resolved = toastNullError({
        result: resolveResult,
        shortMessage: "Error resolving conflicts.",
      });

      if (!resolved) {
        return;
      }

      diff = resolved;
    } else {
      diff = applyDiff as ParsedFile[];
    }

    setAppliedDiff(diff);
  }, [projectRepositoryNameParam, diffToApply, selectedDirectoryIdParam]);

  const handleBackFromAppliedDiff = useCallback(async () => {
    if (!projectRepositoryNameParam) {
      toastNullError({
        shortMessage: "Project repository name not found.",
      });
      return;
    }

    if (selectedDirectoryIdParam) {
      // when going back just delete project that was created. Then recreate again when going to diff. For projects this is an easy workflow for templates will be another step after viewing the diff. and no changes will be applied to project when showing first diff so when going back from first diff no deletion is necessary.
      const result = await cancelProjectCreation(projectRepositoryNameParam);

      const cancel = toastNullError({
        result: result,
        shortMessage: "Error deleting project.",
      });
      if (cancel === false) {
        return;
      }
    } else {
      const restoreResult = await restoreAllChangesToCleanProject(
        projectRepositoryNameParam,
      );
      const restored = toastNullError({
        result: restoreResult,
        shortMessage: "Error restoring changes.",
      });
      if (restored === false) {
        return;
      }
    }

    setAppliedDiff(null);
  }, [projectRepositoryNameParam, selectedDirectoryIdParam]);

  const handleBackFromDiffToApply = useCallback(() => {
    setDiffToApply(null);
  }, []);

  const templateSettingsDefaultValues: Record<string, any> = useMemo(() => {
    if (settingsDraft && Object.keys(settingsDraft).length > 0) {
      return settingsDraft;
    }
    return baseTemplateSettingsDefaultValues;
  }, [baseTemplateSettingsDefaultValues, settingsDraft]);

  useEffect(() => {
    if (
      existingTemplateInstanceIdParam &&
      !settingsDraft &&
      Object.keys(baseTemplateSettingsDefaultValues).length > 0
    ) {
      setSettingsDraft(baseTemplateSettingsDefaultValues as UserTemplateSettings);
    }
  }, [
    existingTemplateInstanceIdParam,
    settingsDraft,
    baseTemplateSettingsDefaultValues,
  ]);

  if (!projectRepositoryNameParam) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold">
          Project repository name not provided in search params.
        </h1>
      </div>
    );
  }

  if (
    !rootTemplate ||
    (!project &&
      (parentTemplateInstanceIdParam ||
        existingTemplateInstanceIdParam ||
        newRevisionHashParam))
  ) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold">Loading...</h1>
      </div>
    );
  }

  if (flowPhase === "init" && initStages[initStageIndex]) {
    const entry = initStages[initStageIndex]!;
    const key = getStageKey(entry);

    return (
      <div className="container py-4 mx-auto">
        {entry.stage.render({
          templateName: templateNameParam ?? "",
          projectRepositoryName: projectRepositoryNameParam ?? undefined,
          currentSettings: readonlyStageSettings,
          settingsDraft,
          stageState: stageState[key],
          setStageState: (value) => updateStageState(key, value),
          setSettingsDraft: setDraftAndDefaults,
          onContinue: handleInitContinue,
        })}
      </div>
    );
  }

  if (flowPhase === "before" && beforeStages[beforeStageIndex]) {
    const entry = beforeStages[beforeStageIndex]!;
    const key = getStageKey(entry);

    return (
      <div className="container py-4 mx-auto">
        {entry.stage.render({
          templateName: templateNameParam ?? "",
          projectRepositoryName: projectRepositoryNameParam ?? undefined,
          currentSettings: readonlyStageSettings,
          settingsDraft,
          stageState: stageState[key],
          setStageState: (value) => updateStageState(key, value),
          setSettingsDraft: setDraftAndDefaults,
          onContinue: handleBeforeContinue,
        })}
      </div>
    );
  }

  if (
    flowPhase === "after" &&
    afterStages[afterStageIndex] &&
    pendingSettings
  ) {
    const entry = afterStages[afterStageIndex]!;
    const key = getStageKey(entry);

    return (
      <div className="container py-4 mx-auto">
        {entry.stage.render({
          templateName: templateNameParam ?? "",
          projectRepositoryName: projectRepositoryNameParam ?? undefined,
          currentSettings: pendingSettings,
          settingsDraft,
          stageState: stageState[key],
          setStageState: (value) => updateStageState(key, value),
          setSettingsDraft: setDraftAndDefaults,
          onContinue: handleAfterContinue,
        })}
      </div>
    );
  }

  if (
    flowPhase === "finalize" &&
    finalizeStages[finalizeStageIndex] &&
    pendingFinalizeSettings
  ) {
    const entry = finalizeStages[finalizeStageIndex]!;
    const key = getStageKey(entry);

    return (
      <div className="container py-4 mx-auto">
        {entry.stage.render({
          templateName: templateNameParam ?? "",
          projectRepositoryName: projectRepositoryNameParam ?? undefined,
          currentSettings: pendingFinalizeSettings,
          settingsDraft,
          stageState: stageState[key],
          setStageState: (value) => updateStageState(key, value),
          setSettingsDraft: setDraftAndDefaults,
          onContinue: handleFinalizeContinue,
        })}
      </div>
    );
  }

  if (appliedDiff) {
    return (
      <div className="container py-4 mx-auto">
        <h1 className="text-2xl font-bold mb-4">Diff to apply</h1>
        <DiffVisualizerPage
          projectRepositoryName={projectRepositoryNameParam}
          parsedDiff={appliedDiff}
        />
        <div className="flex justify-between mt-4">
          {selectedDirectoryIdParam ? (
            <ConfirmationDialog
              buttonText={"Back"}
              actionText={"Delete"}
              dialogTitle={"Delete Project"}
              dialogDescription={"Go back and delete current project."}
              onConfirm={async () => {
                handleBackFromAppliedDiff();
                return { data: undefined };
              }}
            />
          ) : (
            <Button variant="outline" onClick={handleBackFromAppliedDiff}>
              Back
            </Button>
          )}
          <CommitButton
            onCommit={handleConfirmAppliedDiff}
            onCancel={() => {}}
          />
        </div>
      </div>
    );
  }

  if (diffToApply) {
    return (
      <div className="container py-4 mx-auto">
        <h1 className="text-2xl font-bold mb-4">Diff to apply</h1>
        <DiffVisualizerPage
          projectRepositoryName={projectRepositoryNameParam}
          parsedDiff={diffToApply.parsedDiff}
        />
        <div className="flex flex-row-reverse justify-between mt-4">
          <Button variant="outline" onClick={handleSubmitDiffToApply}>
            Apply Diff
          </Button>
          {!newRevisionHashParam ? (
            <Button variant="outline" onClick={handleBackFromDiffToApply}>
              Back
            </Button>
          ) : (
            <Button variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!subTemplate || "error" in subTemplate || !subTemplate.data) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold">
          SubTemplate not found in template
        </h1>
        {subTemplate && "error" in subTemplate && (
          <p className="text-red-500">Error: {subTemplate.error}</p>
        )}

        <div className="flex justify-between mt-4">
          <Button variant="outline" onClick={() => router.back()}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  if (!templateNameParam) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold">
          Template name not provided in search params.
        </h1>
        <div className="flex justify-between mt-4">
          <Button variant="outline" onClick={() => router.back()}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full space-y-4">
      {selectedDirectoryIdParam ? (
        <div className="w-full h-16 bg-gray-50 border-b border-b-gray-300 flex items-center justify-end px-4">
          <FileUploadDialog
            onUpload={handleUploadProjectSettings}
            onCancel={async () => ({ data: undefined })}
            buttonText={"Create from project settings"}
          />
        </div>
      ) : null}
      {pluginCompatibility && !pluginCompatibility.compatible ? (
        <div className="px-4">
          <PluginCompatibilityDetails
            result={pluginCompatibility}
            title="Required plugins missing"
          />
        </div>
      ) : null}
      {pluginCompatibility === null && pluginSettings === null ? (
        <div className="px-4 text-sm text-muted-foreground">
          Checking plugin compatibility and global settings...
        </div>
      ) : null}
      <TemplateSettingsForm
        projectRepositoryName={projectRepositoryNameParam}
        selectedTemplate={templateNameParam}
        selectedTemplateSettingsSchema={
          subTemplate.data.config.templateSettingsSchema
        }
        formDefaultValues={templateSettingsDefaultValues}
        action={startAfterStages}
        cancel={() => {
          router.push(
            `/projects/${projectRepositoryNameParam && !selectedDirectoryIdParam ? `project/?projectRepositoryName=${projectRepositoryNameParam}` : ""}`,
          );
        }}
        submitDisabled={
          pluginSettings === null ||
          Boolean(pluginCompatibility && !pluginCompatibility.compatible)
        }
        submitDisabledReason={
          pluginSettings === null
            ? "Checking plugin compatibility..."
            : "Install the required plugins to continue."
        }
      />
    </div>
  );
};

export default TemplateInstantiationPage;
