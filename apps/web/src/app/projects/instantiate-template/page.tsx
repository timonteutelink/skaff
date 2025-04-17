"use client";
import { commitChanges } from "@/app/actions/git";
import { applyTemplateDiffToProject, cancelProjectCreation, createNewProject, prepareTemplateInstantiationDiff, resolveConflictsAndDiff, restoreAllChangesToCleanProject } from "@/app/actions/instantiate";
import { retrieveProject } from "@/app/actions/project";
import { retrieveTemplate } from "@/app/actions/template";
import CommitButton from "@/components/general/git/commit-dialog";
import { DiffVisualizerPage } from "@/components/general/git/diff-visualizer-page";
import { TemplateSettingsForm } from "@/components/general/template-settings/template-settings-form";
import { Button } from "@/components/ui/button";
import { NewTemplateDiffResult, ParsedFile, ProjectDTO, Result, TemplateDTO } from "@repo/ts/utils/types";
import { findTemplate } from "@repo/ts/utils/utils";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const ProjectTemplateTreePage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectNameParam = useMemo(
    () => searchParams.get("projectName"),
    [searchParams],
  );
  const rootTemplateNameParam = useMemo(
    () => searchParams.get("rootTemplate"),
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
  const creatingNewProject = useMemo(() => selectedDirectoryIdParam && !parentTemplateInstanceIdParam, [
    selectedDirectoryIdParam,
    parentTemplateInstanceIdParam,
  ]);
  const [project, setProject] = useState<ProjectDTO>();
  const [rootTemplate, setRootTemplate] = useState<TemplateDTO>();
  const [diffToApply, setDiffToApply] = useState<NewTemplateDiffResult | null>(null);
  const [appliedDiff, setAppliedDiff] = useState<ParsedFile[] | null>(null);

  useEffect(() => {
    if (!projectNameParam) {
      console.error("No project name provided in search params.");
      toast.error("No project name provided in search params.");
      router.push("/projects");
      return;
    }
    if (!rootTemplateNameParam) {
      console.error("No root template name provided in search params.");
      toast.error("No root template name provided in search params.");
      router.push("/projects");
      return;
    }
    if (
      creatingNewProject &&
      rootTemplateNameParam !== templateNameParam
    ) {
      console.error(
        "No parent template instance ID provided in search params. Provide it or make sure the root template name is the same as the template name.",
      );
      toast.error(
        "No parent template instance ID provided in search params. Provide it or make sure the root template name is the same as the template name.",
      );
      router.push("/projects");
      return;
    }
    retrieveProject(projectNameParam).then((data: Result<ProjectDTO | null>) => {
      if ('error' in data) {
        console.error("Error retrieving project:", data.error);
        toast.error("Error retrieving project: " + data.error);
        return;
      }
      if (!data.data) {
        if (!creatingNewProject) {
          console.error("Project not found:", projectNameParam);
          toast.error("Project not found: " + projectNameParam);
          router.push("/projects");
        }
        return;
      }
      setProject(data.data);
    });
    retrieveTemplate(rootTemplateNameParam).then((data: Result<TemplateDTO | null>) => {
      if ('error' in data) {
        console.error("Error retrieving template:", data.error);
        toast.error("Error retrieving template: " + data.error);
        return;
      }

      if (!data.data) {
        console.error("Template not found:", rootTemplateNameParam);
        toast.error("Template not found: " + rootTemplateNameParam);
        router.push("/projects");
        return;
      }
      setRootTemplate(data.data);
    });
  }, [
    projectNameParam,
    router,
    rootTemplateNameParam,
    templateNameParam,
    parentTemplateInstanceIdParam,
    selectedDirectoryIdParam,
    creatingNewProject,
  ]);

  const subTemplate = useMemo(() => {
    if (!rootTemplate || !templateNameParam) {
      return null;
    }
    return findTemplate(rootTemplate, templateNameParam);
  }, [rootTemplate, templateNameParam]);

  const handleSubmitSettings = useCallback(async (data: UserTemplateSettings) => {
    if (!projectNameParam || !templateNameParam || !rootTemplateNameParam || !rootTemplate || !subTemplate) {
      console.error("Project name or root template not found.");
      toast.error("Project name or root template not found.");
      return;
    }

    if (selectedDirectoryIdParam) {
      const newProjectResult = await createNewProject(projectNameParam, templateNameParam, selectedDirectoryIdParam, data);

      if ('error' in newProjectResult) {
        console.error("Failed to create project");
        console.error(newProjectResult.error);
        toast.error("Failed to create project: " + newProjectResult.error);
        return;
      }

      setAppliedDiff(newProjectResult.data.diff);
    } else if (parentTemplateInstanceIdParam) {
      if (!project) {
        console.error("Project not found.");
        toast.error("Project not found.");
        return;
      }

      if (project.settings.projectName !== projectNameParam) {
        console.error("Project name does not match.");
        toast.error("Project name does not match.");
        return;
      }

      if ('error' in subTemplate) {
        console.error("Error finding sub-template:", subTemplate.error);
        toast.error("Error finding sub-template: " + subTemplate.error);
        return;
      }

      if (!subTemplate.data) {
        console.error("Sub-template not found.");
        toast.error("Sub-template not found.");
        return;
      }

      if (subTemplate.data.config.templateConfig.name === rootTemplate.config.templateConfig.name) {
        console.error("Root template cannot be instantiated as a sub-template.");
        toast.error("Root template cannot be instantiated as a sub-template.");
        return;
      }

      const result = await prepareTemplateInstantiationDiff(
        rootTemplate.config.templateConfig.name,
        subTemplate.data.config.templateConfig.name,
        parentTemplateInstanceIdParam!,
        projectNameParam,
        data
      );

      if ("error" in result) {
        console.error("Error instantiating template:", result.error);
        toast.error("Error instantiating template: " + result.error);
        return;
      }

      setDiffToApply(result.data);
    } else {
      console.error("No parent template instance ID or selected directory ID provided.");
      toast.error("No parent template instance ID or selected directory ID provided.");
      return;
    }
  }, [
    projectNameParam,
    rootTemplate,
    subTemplate,
    parentTemplateInstanceIdParam,
    selectedDirectoryIdParam,
    templateNameParam,
    project,
    rootTemplateNameParam,
  ]);

  const handleConfirmAppliedDiff = useCallback(async (commitMessage: string) => {
    if (!projectNameParam || !commitMessage) {
      console.error("Project name or commit message not found.");
      toast.error("Project name or commit message not found.");
      return;
    }
    if (!commitMessage) {
      console.error("Commit message is required.");
      toast.error("Commit message is required.");
      return;
    }

    const result = await commitChanges(projectNameParam, commitMessage);
    if ("error" in result) {
      console.error("Error committing changes:", result.error);
      toast.error("Error committing changes: " + result.error);
      return;
    }
    router.push(`/projects/project/?projectName=${projectNameParam}`);
  }, [router, projectNameParam]);

  const handleSubmitDiffToApply = useCallback(async () => {
    if (!projectNameParam) {
      console.error("Project name not found.");
      toast.error("Project name not found.");
      return;
    }
    if (!diffToApply) {
      console.error("Diff to apply is null.");
      toast.error("Diff to apply is null.");
      return;
    }
    if (creatingNewProject) {
      console.error("When creating new project the diffToApply should not be shown.");
      toast.error("When creating new project the diffToApply should not be shown.");
      return;
    }

    const result = await applyTemplateDiffToProject(projectNameParam, diffToApply.diffHash);
    if ("error" in result) {
      console.error("Error committing changes:", result.error);
      toast.error("Error committing changes: " + result.error);
      return;
    }

    let diff: ParsedFile[];
    if ('resolveBeforeContinuing' in result) {
      const userConfirmed = confirm(
        "There are conflicts in the diff. Please resolve them and press 'OK' to continue.",
      );
      if (!userConfirmed) {
        return;
      }

      const resolveResult = await resolveConflictsAndDiff(projectNameParam);

      if ("error" in resolveResult) {
        console.error("Error resolving conflicts:", resolveResult.error);
        toast.error("Error resolving conflicts: " + resolveResult.error);
        return;
      }

      diff = resolveResult.data;
    } else {
      diff = result.data as ParsedFile[];
    }

    setAppliedDiff(diff);
  }, [projectNameParam, diffToApply, creatingNewProject]);

  const handleBackFromAppliedDiff = useCallback(async () => {
    if (!projectNameParam) {
      console.error("Project name not found.");
      toast.error("Project name not found.");
      return;
    }

    if (creatingNewProject) {
      // when going back just delete project that was created. Then recreate again when going to diff. For projects this is an easy workflow for templates will be another step after viewing the diff. and no changes will be applied to project when showing first diff so when going back from first diff no deletion is necessary.
      const result = await cancelProjectCreation(projectNameParam);
      if ("error" in result) {
        console.error("Error deleting project:", result.error);
        toast.error("Error deleting project: " + result.error);
        return;
      }
    } else {
      const restoreResult = await restoreAllChangesToCleanProject(projectNameParam);
      if ("error" in restoreResult) {
        console.error("Error restoring changes:", restoreResult.error);
        toast.error("Error restoring changes: " + restoreResult.error);
        return;
      }
    }

    setAppliedDiff(null);
  }, [projectNameParam, creatingNewProject]);

  const handleBackFromDiffToApply = useCallback(() => {
    setDiffToApply(null);
  }, []);

  if (!projectNameParam || !rootTemplateNameParam || !templateNameParam) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold">
          Project name, root template name or template name not provided in
          search params.
        </h1>
      </div>
    );
  }

  if (!rootTemplate || (!project && (!selectedDirectoryIdParam && parentTemplateInstanceIdParam))) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold">Loading...</h1>
      </div>
    );
  }

  if (!subTemplate || 'error' in subTemplate || !subTemplate.data) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold">
          SubTemplate not found in template
        </h1>
        {subTemplate && 'error' in subTemplate && (
          <p className="text-red-500">
            Error: {subTemplate.error}
          </p>
        )}
      </div>
    );
  }

  if (appliedDiff) {
    return (
      <div className="container py-10 mx-auto">
        <h1 className="text-2xl font-bold mb-4">Diff to apply</h1>
        <DiffVisualizerPage projectName={projectNameParam} parsedDiff={appliedDiff} />
        <div className="flex justify-between mt-4">
          <Button
            variant="outline"
            onClick={handleBackFromAppliedDiff}
          >
            Back
          </Button>
          <CommitButton
            onCommit={handleConfirmAppliedDiff}
            onCancel={() => { }}
          />
        </div>
      </div>
    )
  }

  if (diffToApply) {
    return (
      <div className="container py-10 mx-auto">
        <h1 className="text-2xl font-bold mb-4">Diff to apply</h1>
        <DiffVisualizerPage projectName={projectNameParam} parsedDiff={diffToApply.parsedDiff} />
        <div className="flex justify-between mt-4">
          <Button
            variant="outline"
            onClick={handleBackFromDiffToApply}
          >
            Back
          </Button>
          <Button
            variant="outline"
            onClick={handleSubmitDiffToApply}
          >
            Apply Diff
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TemplateSettingsForm
      projectName={projectNameParam}
      selectedTemplate={templateNameParam}
      selectedTemplateSettingsSchema={subTemplate.data.config.templateSettingsSchema}
      action={handleSubmitSettings}
      cancel={() => {
        //TODO would delete project here if it was created. Should but now i realise editing a newly created project by going back from the diff is currently not possible. Maybe now going back from the diff should delete the project and then when settings are changed we can just recreate the project.
        router.push(`/projects/`);
      }}
    />
  );
};

export default ProjectTemplateTreePage;
