"use client";
import { createNewProject, instantiateTemplate, reloadProjects, retrieveProject, retrieveTemplate } from "@/app/actions";
import { TemplateSettingsForm } from "@/components/general/template-settings/template-settings-form";
import { ProjectDTO, TemplateDTO } from "@repo/ts/utils/types";
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
  const [createProject, setCreateProject] = useState(false);

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
        setCreateProject(true);
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

    if (createProject) {
      if (!selectedDirectoryIdParam) {
        console.error("No selected directory ID provided for where to create the project.");
        return;
      }
      const newProject = await createNewProject(projectNameParam, templateNameParam, selectedDirectoryIdParam, data);

      if ('error' in newProject) {
        console.error("Failed to create project");
        console.error(newProject.error);
        return;
      }
    } else {
      if (!parentTemplateInstanceIdParam) {
        console.error("No parent template instance ID provided.");
        return;
      }

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
      );

      if ("error" in result) {
        console.error("Error instantiating template:", result.error);
        return;
      }
    }
    await reloadProjects();
    router.push(`/projects/project/?projectName=${projectNameParam}`);
  }, [
    projectNameParam,
    rootTemplate,
    subTemplate,
    parentTemplateInstanceIdParam,
    router,
    createProject,
    selectedDirectoryIdParam,
    templateNameParam,
    project,
    rootTemplateNameParam,
  ]);

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

  if (!rootTemplate || !project) {
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

  return (
    <TemplateSettingsForm
      projectName={projectNameParam}
      selectedTemplate={templateNameParam}
      selectedTemplateSettingsSchema={subTemplate.config.templateSettingsSchema}
      action={handleSubmitSettings}
      cancel={() => {
        router.push(`/projects/`);
      }}
    />
  );
};

export default ProjectTemplateTreePage;
