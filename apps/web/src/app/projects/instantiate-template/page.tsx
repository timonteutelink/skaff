"use client";
import { createNewProject, instantiateTemplate } from "@/app/actions/instantiate";
import { reloadProjects, retrieveProject } from "@/app/actions/project";
import { retrieveTemplate } from "@/app/actions/template";
import { DiffVisualizerPage } from "@/components/general/git/diff-visualizer-page";
import { TemplateSettingsForm } from "@/components/general/template-settings/template-settings-form";
import { Button } from "@/components/ui/button";
import { ParsedFile, ProjectDTO, TemplateDTO } from "@repo/ts/utils/types";
import { findTemplate } from "@repo/ts/utils/utils";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  const [project, setProject] = useState<ProjectDTO>();
  const [rootTemplate, setRootTemplate] = useState<TemplateDTO>();
  const [diff, setDiff] = useState<ParsedFile[] | null>(null);

  useEffect(() => {
    if (!projectNameParam) {
      console.error("No project name provided in search params.");
      router.push("/projects");
      return;
    }
    if (!rootTemplateNameParam) {
      console.error("No root template name provided in search params.");
      router.push("/projects");
      return;
    }
    if (
      !parentTemplateInstanceIdParam &&
      rootTemplateNameParam !== templateNameParam
    ) {
      console.error(
        "No parent template instance ID provided in search params. Provide it or make sure the root template name is the same as the template name.",
      );
      router.push("/projects");
      return;
    }
    retrieveProject(projectNameParam).then((data: ProjectDTO | null) => {
      if (!data) {
        if (!selectedDirectoryIdParam || parentTemplateInstanceIdParam) {
          console.error("Project not found:", projectNameParam);
          router.push("/projects");
        }
        return;
      }
      setProject(data);
    });
    retrieveTemplate(rootTemplateNameParam).then((data: TemplateDTO | null) => {
      if (!data) {
        console.error("Template not found:", rootTemplateNameParam);
        router.push("/projects");
        return;
      }
      setRootTemplate(data);
    });
  }, [
    projectNameParam,
    router,
    rootTemplateNameParam,
    templateNameParam,
    parentTemplateInstanceIdParam,
    selectedDirectoryIdParam,
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
      return;
    }

    if (selectedDirectoryIdParam) {
      const newProjectResult = await createNewProject(projectNameParam, templateNameParam, selectedDirectoryIdParam, data);

      if ('error' in newProjectResult) {
        console.error("Failed to create project");
        console.error(newProjectResult.error);
        return;
      }

      setDiff(newProjectResult.data.diff);
    } else if (parentTemplateInstanceIdParam) {
      if (!project) {
        console.error("Project not found.");
        return;
      }

      if (project.settings.projectName !== projectNameParam) {
        console.error("Project name does not match.");
        return;
      }

      if (subTemplate.config.templateConfig.name === rootTemplate.config.templateConfig.name) {
        console.error("Root template cannot be instantiated as a sub-template.");
        return;
      }

      const result = await instantiateTemplate(
        rootTemplate.config.templateConfig.name,
        subTemplate.config.templateConfig.name,
        parentTemplateInstanceIdParam!,
        projectNameParam,
        data
      ); //TODO: first show the generic diff from clean projects. Then the actually applying diff

      if ("error" in result) {
        console.error("Error instantiating template:", result.error);
        return;
      }
    } else {
      console.error("No parent template instance ID or selected directory ID provided.");
      return;
    }
    await reloadProjects();
    router.push(`/projects/project/?projectName=${projectNameParam}`);
  }, [
    projectNameParam,
    rootTemplate,
    subTemplate,
    parentTemplateInstanceIdParam,
    router,
    selectedDirectoryIdParam,
    templateNameParam,
    project,
    rootTemplateNameParam,
  ]);

  const handleConfirmChanges = useCallback(async () => {
    if (!project) {
      console.error("Project not found.");
      return;
    }

    if (diff) {
      const diffString = JSON.stringify(diff, null, 2);
      alert(diffString);
    } else {
      console.error("No diff available.");
    }
  }, [diff, project]);

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

  if (!subTemplate) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold">
          SubTemplate not found in template
        </h1>
      </div>
    );
  }

  if (diff) {
    return (
      <div className="container py-10 mx-auto">
        <h1 className="text-2xl font-bold mb-4">Diff</h1>
        <DiffVisualizerPage parsedDiff={diff} />
        <div className="flex justify-between mt-4">
          <Button
            variant="outline"
            onClick={() => setDiff(null)}
          >
            Back
          </Button>
          <Button
            onClick={handleConfirmChanges}
          >
            Continue
          </Button>
        </div>
      </div>
    )
  }

  return (
    <TemplateSettingsForm
      projectName={projectNameParam}
      selectedTemplate={templateNameParam}
      selectedTemplateSettingsSchema={subTemplate.config.templateSettingsSchema}
      action={handleSubmitSettings}
      cancel={() => {
        //TODO would delete project here if it was created. Should but now i realise editing a newly created project by going back from the diff is currently not possible. Maybe now going back from the diff should delete the project and then when settings are changed we can just recreate the project.
        router.push(`/projects/`);
      }}
    />
  );
};

export default ProjectTemplateTreePage;
