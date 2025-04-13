"use client";
import { retrieveProject, retrieveTemplate } from "@/app/actions";
import { TemplateSettingsForm } from "@/components/general/template-settings/template-settings-form";
import { ProjectDTO, TemplateDTO } from "@repo/ts/utils/types";
import { findTemplate } from "@repo/ts/utils/utils";
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

  const handleSubmitSettings = useCallback(async (data: any) => {
    alert(JSON.stringify(data, null, 2));
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
