'use client';
import { retrieveProjects } from "@/app/actions";
import TablePage, { FieldInfo } from "@/components/general/TablePage";
import { ProjectDTO } from "@repo/ts/utils/types";
import { useEffect, useState } from "react";

const columnMapping: FieldInfo<ProjectDTO>[] = [
  {
    name: "Name",
    data: (project: ProjectDTO) => project.name,
  },
  {
    name: "Root Template",
    data: (project: ProjectDTO) => project.rootTemplateName,
  }
]

export default function TemplatesListPage() {
  const [projects, setProjects] = useState<ProjectDTO[]>([]);

  useEffect(() => {
    retrieveProjects().then((projects) => {
      setProjects(projects);
    });
  }, []);

  return (
    <TablePage<ProjectDTO>
      title="Detected Projects"
      addButtonText="Create New Project"
      addButtonUrl="/projects/create"
      data={projects}
      columnMapping={columnMapping}
      caption="A list of your projects."
    />
  )
}
