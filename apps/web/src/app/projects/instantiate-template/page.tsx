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
import { retrieveDefaultTemplate, retrieveTemplateRevisionForProject } from "@/app/actions/template";
import CommitButton from "@/components/general/git/commit-dialog";
import { DiffVisualizerPage } from "@/components/general/git/diff-visualizer-page";
import { TemplateSettingsForm } from "@/components/general/template-settings/template-settings-form";
import { Button } from "@/components/ui/button";
import { findTemplate } from "@repo/ts/utils/shared-utils";
import {
  DefaultTemplateResult,
  NewTemplateDiffResult,
  ParsedFile,
  ProjectDTO,
  Result,
  TemplateDTO
} from "@repo/ts/lib/types";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toastNullError } from "@/lib/utils";
import { FileUploadDialog, JsonFile } from "@/components/general/file-upload-dialog";
import { ConfirmationDialog } from "@/components/general/confirmation-dialog";

// TODO: when updating to a new template version we should reiterate all settings of all templates for possible changes. Or we fully automate go directly to diff but require the template to setup sensible defaults for possible new options.

// TODO: add lot more checks on backend. For example cannot edit autoinstantiated template.
// TODO add another flow for instantiating full project from projectSettings.
const TemplateInstantiationPage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectNameParam = useMemo(
    () => searchParams.get("projectName"),
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
  const [project, setProject] = useState<ProjectDTO>();
  const [rootTemplate, setRootTemplate] = useState<TemplateDTO>();
  const [diffToApply, setDiffToApply] = useState<NewTemplateDiffResult | null>(
    null,
  );
  const [appliedDiff, setAppliedDiff] = useState<ParsedFile[] | null>(null);
  const [storedFormData, setStoredFormData] = useState<UserTemplateSettings | null>(null);

  useEffect(() => {
    if (!projectNameParam) {
      toastNullError({
        shortMessage: "Project name not provided in search params.",
      })
      router.push("/projects");
      return;
    }
    if (!newRevisionHashParam && !templateNameParam) {
      toastNullError({
        shortMessage: "Template name not provided in search params.",
      })
      router.push("/projects");
      return;
    }
    if (
      (selectedDirectoryIdParam && parentTemplateInstanceIdParam) ||
      (selectedDirectoryIdParam && existingTemplateInstanceIdParam) ||
      (selectedDirectoryIdParam && newRevisionHashParam) ||
      (parentTemplateInstanceIdParam && existingTemplateInstanceIdParam) ||
      (parentTemplateInstanceIdParam && newRevisionHashParam) ||
      (existingTemplateInstanceIdParam && newRevisionHashParam) ||
      (!selectedDirectoryIdParam &&
        !parentTemplateInstanceIdParam &&
        !existingTemplateInstanceIdParam &&
        !newRevisionHashParam)
    ) {
      toastNullError({
        shortMessage: "Cannot only provide one of selectedDirectoryId or parentTemplateInstanceId or existingTemplateInstanceId or newRevisionHash.",
      })
      router.push("/projects");
      return;
    }
    const retrieveStuff = async () => {
      const [projectResult, revisionResult] = await Promise.all([retrieveProject(projectNameParam), selectedDirectoryIdParam ? retrieveDefaultTemplate(templateNameParam!) : retrieveTemplateRevisionForProject(projectNameParam)]);

      const revision = toastNullError({
        result: revisionResult as Result<DefaultTemplateResult | TemplateDTO | null>,
        shortMessage: "Error retrieving template.",
        nullErrorMessage: `Template not found for project: ${projectNameParam}`,
        nullRedirectPath: "/projects",
        router,
      })

      if (!revision) {
        return
      }

      if ("template" in revision) {
        const template = revision.template;
        if (!template) {
          toastNullError({
            shortMessage: "Template not found in revision data.",
          })
          return;
        }
        setRootTemplate(template);
        return;
      }

      setRootTemplate(revision);

      const project = toastNullError({
        result: projectResult,
        shortMessage: "Error retrieving project.",
      })
      if (!project) {
        if (!selectedDirectoryIdParam) {
          toastNullError({
            shortMessage: `Project not found: ${projectNameParam}`,
          })
          router.push("/projects");
        }
        return;
      }
      if (project.settings.instantiatedTemplates.length === 0) {
        toastNullError({
          shortMessage: "No instantiated templates found in project.",
        })
        router.push("/projects");
        return;
      }

      setProject(project)

      if (!newRevisionHashParam) {
        return;
      }
      const newRevisionResult = await retrieveDiffUpdateProjectNewTemplateRevision(
        projectNameParam,
        newRevisionHashParam,
      );
      const newRevision = toastNullError({
        result: newRevisionResult,
        shortMessage: "Error retrieving template.",
      })
      if (!newRevision) {
        return
      }
      setDiffToApply(newRevision)
    };
    retrieveStuff();
  }, [
    projectNameParam,
    router,
    templateNameParam,
    parentTemplateInstanceIdParam,
    selectedDirectoryIdParam,
    existingTemplateInstanceIdParam,
    newRevisionHashParam,
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
        !projectNameParam ||
        !templateNameParam ||
        !rootTemplate ||
        !subTemplate
      ) {
        toastNullError({
          shortMessage: "Project name or template name not found.",
        })
        return;
      }

      setStoredFormData(data);
      if (selectedDirectoryIdParam) {
        const newProjectResult = await createNewProject(
          projectNameParam,
          templateNameParam,
          selectedDirectoryIdParam,
          data,
        );

        const newProject = toastNullError({
          result: newProjectResult,
          shortMessage: "Error creating project.",
        })

        if (!newProject) {
          return
        }

        setAppliedDiff(newProject.diff);
      } else if (parentTemplateInstanceIdParam) {
        if (!project) {
          toastNullError({
            shortMessage: "Project not found.",
          })
          return;
        }

        if (project.settings.projectName !== projectNameParam) {
          toastNullError({
            shortMessage: "Project name does not match.",
          })
          return;
        }

        const subTemplateValue = toastNullError({
          result: subTemplate,
          shortMessage: "Error finding sub-template.",
          nullErrorMessage: "Sub-template not found.",
        })

        if (!subTemplateValue) {
          return
        }

        if (
          subTemplateValue.config.templateConfig.name ===
          rootTemplate.config.templateConfig.name
        ) {
          toastNullError({
            shortMessage: "Root template cannot be instantiated as a sub-template.",
          })
          return;
        }

        const templateInstantiationResult = await prepareTemplateInstantiationDiff(
          rootTemplate.config.templateConfig.name,
          subTemplateValue.config.templateConfig.name,
          parentTemplateInstanceIdParam!,
          projectNameParam,
          data,
        );

        const result = toastNullError({
          result: templateInstantiationResult,
          shortMessage: "Error instantiating template.",
        })

        if (!result) {
          return
        }

        setDiffToApply(result);
      } else if (existingTemplateInstanceIdParam) {
        if (!project) {
          toastNullError({
            shortMessage: `Project not found: ${projectNameParam}`,
          })
          return;
        }

        if (project.settings.projectName !== projectNameParam) {
          toastNullError({
            shortMessage: "Project name does not match.",
          })
          return;
        }

        const subTemplateValue = toastNullError({
          result: subTemplate,
          shortMessage: "Error finding sub-template.",
          nullErrorMessage: "Sub-template not found.",
        })
        if (!subTemplateValue) {
          return
        }

        const templateModificationResult = await prepareTemplateModificationDiff(
          data,
          projectNameParam,
          existingTemplateInstanceIdParam,
        );

        const templateModification = toastNullError({
          result: templateModificationResult,
          shortMessage: "Error instantiating template.",
        })
        if (!templateModification) {
          return
        }

        setDiffToApply(templateModification);
      } else {
        toastNullError({
          shortMessage: "No parent template instance ID or selected directory ID provided.",
        })
        return;
      }
    },
    [
      projectNameParam,
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
      if (!projectNameParam || !commitMessage) {
        toastNullError({
          shortMessage: "Project name or commit message not found.",
        })
        return;
      }
      if (!commitMessage) {
        toastNullError({
          shortMessage: "Commit message is required.",
        })
        return;
      }

      const commitResult = await commitChanges(projectNameParam, commitMessage);

      const commit = toastNullError({
        result: commitResult,
        shortMessage: "Error committing changes.",
      })

      if (commit === false) {
        return
      }
      router.push(`/projects/project/?projectName=${projectNameParam}`);
    },
    [router, projectNameParam],
  );

  const handleUploadProjectSettings = useCallback(async (jsons: JsonFile[]): Promise<Result<void>> => {
    if (!templateNameParam || !selectedDirectoryIdParam || !projectNameParam) {
      toastNullError({
        shortMessage: "Not creating a project. 'template' or 'selectedDirectoryId' or 'projectName' is missing."
      })
      return { data: undefined };
    }
    const projectSettingsJson = jsons[0]!;

    try {
      const parsedProjectSettings = JSON.parse(projectSettingsJson.text);

      if (parsedProjectSettings.rootTemplateName !== templateNameParam) {
        toastNullError({
          shortMessage: "The template selected in the previous step does not match the root template in the uploaded project settings"
        })
        return { error: "The template selected in the previous step does not match the root template in the uploaded project settings" }
      }
    } catch (error) {
      toastNullError({
        error,
        shortMessage: "Error occured parsing the loaded project settings json"
      })
      return { error: "Error occured parsing the loaded project settings json" }
    }

    const newProjectResult = await generateProjectFromProjectSettings(projectSettingsJson.text, selectedDirectoryIdParam, projectNameParam);

    const newProject = toastNullError({
      result: newProjectResult,
      shortMessage: "Error creating project.",
    })

    if (!newProject) {
      return { error: "Project creating failed" };
    }

    setAppliedDiff(newProject.diff);
    return { data: undefined };
  }, [projectNameParam, selectedDirectoryIdParam, templateNameParam])

  const handleSubmitDiffToApply = useCallback(async () => {
    if (!projectNameParam) {
      toastNullError({
        shortMessage: "Project name not found.",
      })
      return;
    }
    if (!diffToApply) {
      toastNullError({
        shortMessage: "Diff to apply is null.",
      })
      return;
    }
    if (selectedDirectoryIdParam) {
      toastNullError({
        shortMessage: "Diff to apply should not be shown.",
      })
      return;
    }

    const applyDiffResult = await applyTemplateDiffToProject(
      projectNameParam,
      diffToApply.diffHash,
    );

    const applyDiff = toastNullError({
      result: applyDiffResult,
      shortMessage: "Error applying diff.",
    })

    if (!applyDiff) {
      return
    }

    let diff: ParsedFile[];
    if ("resolveBeforeContinuing" in applyDiff) {
      const userConfirmed = confirm(
        "There are conflicts in the diff. Please resolve them and press 'OK' to continue.",
      );
      if (!userConfirmed) {
        return;
      }

      const resolveResult = await resolveConflictsAndDiff(projectNameParam);

      const resolved = toastNullError({
        result: resolveResult,
        shortMessage: "Error resolving conflicts.",
      })

      if (!resolved) {
        return
      }

      diff = resolved
    } else {
      diff = applyDiff as ParsedFile[];
    }

    setAppliedDiff(diff);
  }, [projectNameParam, diffToApply, selectedDirectoryIdParam]);

  const handleBackFromAppliedDiff = useCallback(async () => {
    if (!projectNameParam) {
      toastNullError({
        shortMessage: "Project name not found.",
      })
      return;
    }

    if (selectedDirectoryIdParam) {
      // when going back just delete project that was created. Then recreate again when going to diff. For projects this is an easy workflow for templates will be another step after viewing the diff. and no changes will be applied to project when showing first diff so when going back from first diff no deletion is necessary.
      const result = await cancelProjectCreation(projectNameParam);

      const cancel = toastNullError({
        result: result,
        shortMessage: "Error deleting project.",
      })
      if (cancel === false) {
        return
      }
    } else {
      const restoreResult =
        await restoreAllChangesToCleanProject(projectNameParam);
      const restored = toastNullError({
        result: restoreResult,
        shortMessage: "Error restoring changes.",
      })
      if (restored === false) {
        return
      }
    }

    setAppliedDiff(null);
  }, [projectNameParam, selectedDirectoryIdParam]);

  const handleBackFromDiffToApply = useCallback(() => {
    setDiffToApply(null);
  }, []);

  const templateSettingsDefaultValues: Record<string, any> = useMemo(() => {
    if (
      storedFormData &&
      Object.keys(storedFormData).length > 0
    ) {
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

  if (!projectNameParam) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold">
          Project name not provided in search params.
        </h1>
      </div>
    );
  }

  if (
    !rootTemplate ||
    (!project && (parentTemplateInstanceIdParam || existingTemplateInstanceIdParam || newRevisionHashParam))
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
          projectName={projectNameParam}
          parsedDiff={appliedDiff}
        />
        <div className="flex justify-between mt-4">
          {selectedDirectoryIdParam ? (
            <ConfirmationDialog
              buttonText={"Back"}
              actionText={"Delete"}
              dialogTitle={"Delete Project"}
              dialogDescription={"Go back and delete current project."}
              onConfirm={async () => { handleBackFromAppliedDiff(); return { data: undefined } }}
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
          projectName={projectNameParam}
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
      {selectedDirectoryIdParam ? (<div className="w-full h-16 bg-gray-50 border-b border-b-gray-300 flex items-center justify-end px-4">
        <FileUploadDialog
          onUpload={handleUploadProjectSettings}
          onCancel={async () => ({ data: undefined })}
          buttonText={"Create from project settings"}
        />
      </div>) : null}
      <TemplateSettingsForm
        projectName={projectNameParam}
        selectedTemplate={templateNameParam}
        selectedTemplateSettingsSchema={
          subTemplate.data.config.templateSettingsSchema
        }
        formDefaultValues={templateSettingsDefaultValues}
        action={handleSubmitSettings}
        cancel={() => {
          router.push(`/projects/${projectNameParam && !selectedDirectoryIdParam ? `project/?projectName=${projectNameParam}` : ''}`);
        }}
      />
    </div>
  );
};

export default TemplateInstantiationPage;
