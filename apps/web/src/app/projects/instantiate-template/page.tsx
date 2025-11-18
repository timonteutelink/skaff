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
        shortMessage:
          "Provide exactly one instantiation mode.",
      });
      router.push("/projects");
      return;
    }

    const retrieveStuff = async () => {
      let projectResult;
      let revisionResult;
      if (selectedDirectoryIdParam) {
        revisionResult = await retrieveTemplate(templateNameParam!)
      } else {
        [projectResult, revisionResult] = await Promise.all([
          retrieveProject(projectRepositoryNameParam),
          retrieveTemplateRevisionForProject(projectRepositoryNameParam),
        ]);
      }

      const revision = toastNullError({
        result: revisionResult as Result<
          TemplateSummary | TemplateDTO | null
        >,
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

  const subTemplate = useMemo(() => {
    if (!rootTemplate || !templateNameParam) {
      return null;
    }
    return findTemplate(rootTemplate, templateNameParam);
  }, [rootTemplate, templateNameParam]);

  const handleSubmitSettings = useCallback(
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

      setStoredFormData(data);
      if (selectedDirectoryIdParam) {
        const newProjectResult = await createNewProject(
          projectRepositoryNameParam,
          templateNameParam,
          selectedDirectoryIdParam,
          data,
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

        if (project.settings.projectRepositoryName !== projectRepositoryNameParam) {
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
            data,
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

        if (project.settings.projectRepositoryName !== projectRepositoryNameParam) {
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
            data,
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
    },
    [
      projectRepositoryNameParam,
      rootTemplate,
      subTemplate,
      parentTemplateInstanceIdParam,
      selectedDirectoryIdParam,
      templateNameParam,
      project,
      existingTemplateInstanceIdParam,
    ],
  );

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

      const commitResult = await commitChanges(projectRepositoryNameParam, commitMessage);

      const commit = toastNullError({
        result: commitResult,
        shortMessage: "Error committing changes.",
      });

      if (commit === false) {
        return;
      }
      router.push(`/projects/project/?projectRepositoryName=${projectRepositoryNameParam}`);
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

      const resolveResult = await resolveConflictsAndDiff(projectRepositoryNameParam);

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
      const restoreResult =
        await restoreAllChangesToCleanProject(projectRepositoryNameParam);
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
            onCancel={() => { }}
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
    <div className="w-full h-full">
      {selectedDirectoryIdParam ? (
        <div className="w-full h-16 bg-gray-50 border-b border-b-gray-300 flex items-center justify-end px-4">
          <FileUploadDialog
            onUpload={handleUploadProjectSettings}
            onCancel={async () => ({ data: undefined })}
            buttonText={"Create from project settings"}
          />
        </div>
      ) : null}
      <TemplateSettingsForm
        projectRepositoryName={projectRepositoryNameParam}
        selectedTemplate={templateNameParam}
        selectedTemplateSettingsSchema={
          subTemplate.data.config.templateSettingsSchema
        }
        formDefaultValues={templateSettingsDefaultValues}
        action={handleSubmitSettings}
        cancel={() => {
          router.push(
            `/projects/${projectRepositoryNameParam && !selectedDirectoryIdParam ? `project/?projectRepositoryName=${projectRepositoryNameParam}` : ""}`,
          );
        }}
      />
    </div>
  );
};

export default TemplateInstantiationPage;
