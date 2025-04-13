"use client";
import {
  retrieveProjects,
  retrieveProjectSearchPaths,
} from "@/app/actions/project";
import { retrieveTemplates } from "@/app/actions/template";
import TablePage, { FieldInfo } from "@/components/general/TablePage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectDTO, TemplateDTO } from "@repo/ts/utils/types";
import { PlusCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const columnMapping: FieldInfo<ProjectDTO>[] = [
  {
    name: "Name",
    data: (project: ProjectDTO) => project.name,
  },
  {
    name: "Root Template",
    data: (project: ProjectDTO) => project.rootTemplateName,
  },
];

export default function TemplatesListPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [templates, setTemplates] = useState<TemplateDTO[]>([]);
  const [projectSearchPaths, setProjectSearchPaths] = useState<{ id: string; path: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [projectName, setProjectName] = useState("");
  const [selectedDirectory, setSelectedDirectory] = useState("");

  useEffect(() => {
    retrieveProjects().then((projects) => {
      setProjects(projects);
    });
    retrieveTemplates().then((templates) => {
      setTemplates(templates);
    });
    retrieveProjectSearchPaths().then((paths) => {
      setProjectSearchPaths(paths);
    });
  }, []);

  const templateSettingsLink = useMemo(() => {
    return (
      <Button
        disabled={!projectName || !selectedTemplate || !selectedDirectory}
        onClick={() => {
          router.push(
            `/projects/instantiate-template/?projectName=${projectName}&rootTemplate=${selectedTemplate}&template=${selectedTemplate}&selectedProjectDirectoryId=${selectedDirectory}`,
          );
          setOpen(false);
          setProjectName("");
          setSelectedTemplate("");
          setSelectedDirectory("");
        }}
      >
        Create Project
      </Button>
    );
  }, [projectName, selectedTemplate, router, selectedDirectory]);

  const createProjectDialog = useMemo(
    () => (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Create Project
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Choose a template to start your new project.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                placeholder="My Awesome Project"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="template">Template</Label>
              <Select
                value={selectedTemplate}
                onValueChange={setSelectedTemplate}
              >
                <SelectTrigger id="template">
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Templates</SelectLabel>
                    {templates.map((template) => (
                      <SelectItem
                        key={template.config.templateConfig.name}
                        value={template.config.templateConfig.name}
                      >
                        {template.config.templateConfig.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="directory">Project Directory</Label>
              <Select
                value={selectedDirectory}
                onValueChange={setSelectedDirectory}
              >
                <SelectTrigger id="directory">
                  <SelectValue placeholder="Select a directory" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Directories</SelectLabel>
                    {projectSearchPaths.map((path) => (
                      <SelectItem key={path.id} value={path.id}>
                        {path.path}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>{templateSettingsLink}</DialogFooter>
        </DialogContent>
      </Dialog>
    ),
    [
      open,
      projectName,
      selectedTemplate,
      templates,
      selectedDirectory,
      projectSearchPaths,
      templateSettingsLink,
    ],
  );

  return (
    <TablePage<ProjectDTO>
      title="Detected Projects"
      data={projects}
      columnMapping={columnMapping}
      caption="A list of your projects."
      buttons={createProjectDialog}
      onClick={(item) => {
        router.push(`/projects/project?projectName=${item.name}`);
      }}
    />
  );
}
