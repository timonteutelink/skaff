'use client'
import { retrieveProject, retrieveTemplate } from "@/app/actions";
import { TemplateSettingsForm } from "@/components/general/template-settings/template-settings-form";
import { ProjectDTO, TemplateDTO } from "@repo/ts/utils/types";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function findTemplate(rootTemplate: TemplateDTO, subTemplateName: string): TemplateDTO | null {
  if (rootTemplate.config.templateConfig.name === subTemplateName) {
    return rootTemplate;
  }

  for (const subTemplates of Object.values(rootTemplate.subTemplates)) {
    for (const subTemplate of subTemplates) {
      const foundTemplate = findTemplate(subTemplate, subTemplateName);
      if (foundTemplate) {
        return foundTemplate;
      }
    }
  }

  return null;
}

const ProjectTemplateTreePage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectNameParam = useMemo(() => searchParams.get('projectName'), [searchParams]);
  const rootTemplateParam = useMemo(() => searchParams.get('rootTemplate'), [searchParams]);
  const templateParam = useMemo(() => searchParams.get('template'), [searchParams]);
  const parentTemplateInstanceIdParam = useMemo(() => searchParams.get('parentTemplateInstanceId'), [searchParams]);
  const [project, setProject] = useState<ProjectDTO>();
  const [rootTemplate, setRootTemplate] = useState<TemplateDTO>();

  // Fetch project data.
  useEffect(() => {
    if (!projectNameParam) {
      console.error('No project name provided in search params.');
      return;
    }
    retrieveProject(projectNameParam).then((data: ProjectDTO | null) => {
      if (!data) {
        console.error('Project not found:', projectNameParam);
        return;
      }
      setProject(data);
    });
  }, [projectNameParam, router]);

  // Fetch the root template definition.
  useEffect(() => {
    if (project) {
      retrieveTemplate(project.rootTemplateName).then((data: TemplateDTO | null) => {
        if (!data) {
          console.error('Template not found:', project.rootTemplateName);
          return;
        }
        setRootTemplate(data);
      });
    }
  }, [project]);

  const subTemplate = useMemo(() => {
    if (!rootTemplate) return null;
    return findTemplate(rootTemplate, templateParam || '');
  }, [rootTemplate, templateParam]);

  if (!projectNameParam) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold">Project name not provided</h1>
      </div>
    );
  }

  if (!rootTemplateParam) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold">Root template not provided</h1>
      </div>
    );
  }

  if (!templateParam) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold">Template to be created not provided</h1>
      </div>
    );
  }

  if (!rootTemplate) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold">Loading...</h1>
      </div>
    );
  }

  if (!project) { //if the project doesnt exist then it should be created and template should be equal to the root template. So show loader until knowledge is fetched
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold">Project creation not yet implemented</h1>
      </div>
    );
  }

  if (!subTemplate) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="text-2xl font-bold">Template not found</h1>
      </div>
    );
  }

  return (
    <TemplateSettingsForm projectName={projectNameParam} selectedTemplate={templateParam} selectedTemplateSettingsSchema={subTemplate.config.templateSettingsSchema} action={async (a) => alert(JSON.stringify(a))} />
  )
}

export default ProjectTemplateTreePage;
