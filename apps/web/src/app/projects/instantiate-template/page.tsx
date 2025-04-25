"use client";
import { commitChanges } from "@/app/actions/git";
import {
  applyTemplateDiffToProject,
  cancelProjectCreation,
  createNewProject,
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
  NewTemplateDiffResult,
  ParsedFile,
  ProjectDTO,
  TemplateDTO
} from "@repo/ts/lib/types";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

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
      logger.error("No project name provided in search params.");
      toast.error("No project name provided in search params.");
      router.push("/projects");
      return;
    }
    if (!newRevisionHashParam && !existingTemplateInstanceIdParam && !templateNameParam) {
      logger.error("No template name provided in search params.");
      toast.error("No template name provided in search params.");
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
      logger.error(
        "Cannot only provide one of selectedDirectoryId or parentTemplateInstanceId or existingTemplateInstanceId or newRevisionHash.",
      );
      toast.error(
        "Cannot only provide one of selectedDirectoryId or parentTemplateInstanceId or existingTemplateInstanceId or newRevisionHash.",
      );
      router.push("/projects");
      return;
    }
    const retrieveStuff = async () => {
      const [projectResult, revision] = await Promise.all([retrieveProject(projectNameParam), selectedDirectoryIdParam ? retrieveDefaultTemplate(templateNameParam!) : retrieveTemplateRevisionForProject(projectNameParam)]);

      if ("error" in revision) {
        logger.error("Error retrieving template:", revision.error);
        toast.error("Error retrieving template: " + revision.error);
        return;
      }

      if (!revision.data) {
        logger.error("Template not found for project:", projectNameParam);
        toast.error("Template not found for project: " + projectNameParam);
        router.push("/projects");
        return;
      }

      if ("template" in revision.data) {
        const template = revision.data.template;
        if (!template) {
          logger.error("Template not found in revision data.");
          toast.error("Template not found in revision data.");
          return;
        }
        setRootTemplate(template);
        return;
      }

      setRootTemplate(revision.data);

      if ("error" in projectResult) {
        logger.error("Error retrieving project:", projectResult.error);
        toast.error("Error retrieving project: " + projectResult.error);
        return;
      }
      if (!projectResult.data) {
        if (!selectedDirectoryIdParam) {
          logger.error("Project not found:", projectNameParam);
          toast.error("Project not found: " + projectNameParam);
          router.push("/projects");
        }
        return;
      }
      if (projectResult.data.settings.instantiatedTemplates.length === 0) {
        logger.error("No instantiated templates found in project.");
        toast.error("No instantiated templates found in project.");
        router.push("/projects");
        return;
      }

      setProject(projectResult.data);

      if (!newRevisionHashParam) {
        return;
      }
      const newRevisionResult = await retrieveDiffUpdateProjectNewTemplateRevision(
        projectNameParam,
        newRevisionHashParam,
      );
      if ("error" in newRevisionResult) {
        logger.error("Error retrieving template:", newRevisionResult.error);
        toast.error("Error retrieving template: " + newRevisionResult.error);
        return;
      }
      setDiffToApply(newRevisionResult.data);
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
        logger.error("Project name or root template not found.");
        toast.error("Project name or root template not found.");
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

        if ("error" in newProjectResult) {
          logger.error("Failed to create project");
          logger.error(newProjectResult.error);
          toast.error("Failed to create project: " + newProjectResult.error);
          return;
        }

        setAppliedDiff(newProjectResult.data.diff);
      } else if (parentTemplateInstanceIdParam) {
        if (!project) {
          logger.error("Project not found.");
          toast.error("Project not found.");
          return;
        }

        if (project.settings.projectName !== projectNameParam) {
          logger.error("Project name does not match.");
          toast.error("Project name does not match.");
          return;
        }

        if ("error" in subTemplate) {
          logger.error("Error finding sub-template:", subTemplate.error);
          toast.error("Error finding sub-template: " + subTemplate.error);
          return;
        }

        if (!subTemplate.data) {
          logger.error("Sub-template not found.");
          toast.error("Sub-template not found.");
          return;
        }

        if (
          subTemplate.data.config.templateConfig.name ===
          rootTemplate.config.templateConfig.name
        ) {
          logger.error(
            "Root template cannot be instantiated as a sub-template.",
          );
          toast.error(
            "Root template cannot be instantiated as a sub-template.",
          );
          return;
        }

        const result = await prepareTemplateInstantiationDiff(
          rootTemplate.config.templateConfig.name,
          subTemplate.data.config.templateConfig.name,
          parentTemplateInstanceIdParam!,
          projectNameParam,
          data,
        );

        if ("error" in result) {
          logger.error("Error instantiating template:", result.error);
          toast.error("Error instantiating template: " + result.error);
          return;
        }

        setDiffToApply(result.data);
      } else if (existingTemplateInstanceIdParam) {
        if (!project) {
          logger.error("Project not found.");
          toast.error("Project not found.");
          return;
        }

        if (project.settings.projectName !== projectNameParam) {
          logger.error("Project name does not match.");
          toast.error("Project name does not match.");
          return;
        }

        if ("error" in subTemplate) {
          logger.error("Error finding sub-template:", subTemplate.error);
          toast.error("Error finding sub-template: " + subTemplate.error);
          return;
        }

        if (!subTemplate.data) {
          logger.error("Sub-template not found.");
          toast.error("Sub-template not found.");
          return;
        }

        const result = await prepareTemplateModificationDiff(
          data,
          projectNameParam,
          existingTemplateInstanceIdParam,
        );

        if ("error" in result) {
          logger.error("Error instantiating template:", result.error);
          toast.error("Error instantiating template: " + result.error);
          return;
        }

        setDiffToApply(result.data);
      } else {
        logger.error(
          "No parent template instance ID or selected directory ID provided.",
        );
        toast.error(
          "No parent template instance ID or selected directory ID provided.",
        );
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
        logger.error("Project name or commit message not found.");
        toast.error("Project name or commit message not found.");
        return;
      }
      if (!commitMessage) {
        logger.error("Commit message is required.");
        toast.error("Commit message is required.");
        return;
      }

      const result = await commitChanges(projectNameParam, commitMessage);
      if ("error" in result) {
        logger.error("Error committing changes:", result.error);
        toast.error("Error committing changes: " + result.error);
        return;
      }
      router.push(`/projects/project/?projectName=${projectNameParam}`);
    },
    [router, projectNameParam],
  );

  const handleSubmitDiffToApply = useCallback(async () => {
    if (!projectNameParam) {
      logger.error("Project name not found.");
      toast.error("Project name not found.");
      return;
    }
    if (!diffToApply) {
      logger.error("Diff to apply is null.");
      toast.error("Diff to apply is null.");
      return;
    }
    if (selectedDirectoryIdParam) {
      logger.error(
        "When creating new project the diffToApply should not be shown.",
      );
      toast.error(
        "When creating new project the diffToApply should not be shown.",
      );
      return;
    }

    const result = await applyTemplateDiffToProject(
      projectNameParam,
      diffToApply.diffHash,
    );
    if ("error" in result) {
      logger.error("Error committing changes:", result.error);
      toast.error("Error committing changes: " + result.error);
      return;
    }

    let diff: ParsedFile[];
    if ("resolveBeforeContinuing" in result) {
      const userConfirmed = confirm(
        "There are conflicts in the diff. Please resolve them and press 'OK' to continue.",
      );
      if (!userConfirmed) {
        return;
      }

      const resolveResult = await resolveConflictsAndDiff(projectNameParam);

      if ("error" in resolveResult) {
        logger.error("Error resolving conflicts:", resolveResult.error);
        toast.error("Error resolving conflicts: " + resolveResult.error);
        return;
      }

      diff = resolveResult.data;
    } else {
      diff = result.data as ParsedFile[];
    }

    setAppliedDiff(diff);
  }, [projectNameParam, diffToApply, selectedDirectoryIdParam]);

  const handleBackFromAppliedDiff = useCallback(async () => {
    if (!projectNameParam) {
      logger.error("Project name not found.");
      toast.error("Project name not found.");
      return;
    }

    if (selectedDirectoryIdParam) {
      // when going back just delete project that was created. Then recreate again when going to diff. For projects this is an easy workflow for templates will be another step after viewing the diff. and no changes will be applied to project when showing first diff so when going back from first diff no deletion is necessary.
      const result = await cancelProjectCreation(projectNameParam);
      if ("error" in result) {
        logger.error("Error deleting project:", result.error);
        toast.error("Error deleting project: " + result.error);
        return;
      }
    } else {
      const restoreResult =
        await restoreAllChangesToCleanProject(projectNameParam);
      if ("error" in restoreResult) {
        logger.error("Error restoring changes:", restoreResult.error);
        toast.error("Error restoring changes: " + restoreResult.error);
        return;
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
          <Button variant="outline" onClick={handleBackFromAppliedDiff}>
            Back
          </Button>
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
          {!newRevisionHashParam ? <Button variant="outline" onClick={handleBackFromDiffToApply}>
            Back
          </Button> : null}
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
      </div>
    );
  }

  if (!templateNameParam) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold">
          Template name not provided in search params.
        </h1>
      </div>
    );
  }

  return (
    <TemplateSettingsForm
      projectName={projectNameParam}
      selectedTemplate={templateNameParam}
      selectedTemplateSettingsSchema={
        subTemplate.data.config.templateSettingsSchema
      }
      formDefaultValues={templateSettingsDefaultValues}
      action={handleSubmitSettings}
      cancel={() => {
        //TODO would delete project here if it was created. Should but now i realise editing a newly created project by going back from the diff is currently not possible. Maybe now going back from the diff should delete the project and then when settings are changed we can just recreate the project.
        router.push(`/projects/`);
      }}
    />
  );
};

export default TemplateInstantiationPage;
