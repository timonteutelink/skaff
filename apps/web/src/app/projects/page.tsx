'use client';
import { createNewProject, retrieveProjects, retrieveProjectSearchPaths, retrieveTemplates } from "@/app/actions";
import TablePage, { FieldInfo } from "@/components/general/TablePage";
import { TemplateSettingsDialog } from "@/components/general/TemplateSettingsDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProjectDTO, TemplateDTO } from "@repo/ts/utils/types";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { PlusCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  const [templates, setTemplates] = useState<TemplateDTO[]>([]);
  const [projectSearchPaths, setProjectSearchPaths] = useState<string[]>([]);
  const [open, setOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState("")
  const [projectName, setProjectName] = useState("")
  const [selectedDirectory, setSelectedDirectory] = useState("")

  const handleCreateProject = useCallback(async (userSettings: UserTemplateSettings) => {
    console.log("Creating project:", { name: projectName, template: selectedTemplate, parentDirPath: selectedDirectory });

    const newProject = await createNewProject(projectName, selectedTemplate, selectedDirectory, userSettings);
    if ('error' in newProject) {
      console.error("Failed to create project");
      console.error(newProject.error);
      return;
    }

    setOpen(false)
    setProjectName("")
    setSelectedTemplate("")
    setSelectedDirectory("")

    setProjects((prev) => [...prev, newProject.data]);
  }, [projectName, selectedTemplate, selectedDirectory]);

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

  const templateSettingsDialog = useMemo(() => {
    const selectedTemplateSettingsSchema = templates.find((template) => template.config.templateConfig.name === selectedTemplate)?.config.templateSettingsSchema;
    if (!selectedTemplateSettingsSchema) {
      return null;
    }
    return (<TemplateSettingsDialog
      projectName={projectName}
      selectedTemplate={selectedTemplate}
      selectedTemplateSettingsSchema={selectedTemplateSettingsSchema}

      action={handleCreateProject}
      cancel={() => {
        setOpen(false);
        setProjectName("");
        setSelectedTemplate("");
        setSelectedDirectory("");
      }}
    >
      <Button disabled={!projectName || !selectedTemplate}>
        Create Project
      </Button>
    </TemplateSettingsDialog>)
  }, [projectName, selectedTemplate, handleCreateProject, templates]);


  const createProjectDialog = useMemo(() => (
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
          <DialogDescription>Choose a template to start your new project.</DialogDescription>
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
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger id="template">
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Templates</SelectLabel>
                  {templates.map((template) => (
                    <SelectItem key={template.config.templateConfig.name} value={template.config.templateConfig.name}>
                      {template.config.templateConfig.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="directory">Project Directory</Label>
            <Select value={selectedDirectory} onValueChange={setSelectedDirectory}>
              <SelectTrigger id="directory">
                <SelectValue placeholder="Select a directory" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Directories</SelectLabel>
                  {projectSearchPaths.map((path) => (
                    <SelectItem key={path} value={path}>
                      {path}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          {templateSettingsDialog}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ), [open, projectName, selectedTemplate, handleCreateProject, templates, selectedDirectory]);

  return (
    <TablePage<ProjectDTO>
      title="Detected Projects"
      data={projects}
      columnMapping={columnMapping}
      caption="A list of your projects."
      buttons={createProjectDialog}
    />
  )
}
