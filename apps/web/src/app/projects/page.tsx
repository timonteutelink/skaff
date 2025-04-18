"use client";
import {
  retrieveProjects,
  retrieveProjectSearchPaths,
} from "@/app/actions/project";
import { retrieveTemplates } from "@/app/actions/template";
import TablePage, { type FieldInfo } from "@/components/general/TablePage";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  projectNameRegex,
  type ProjectDTO,
  type TemplateDTO,
} from "@repo/ts/utils/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";

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

const formSchema = z.object({
  projectName: z
    .string()
    .min(1, "Project name is required")
    .regex(
      projectNameRegex,
      "Project name can only contain letters, numbers, dashes and underscores.",
    ),
  template: z.string().min(1, "Template is required"),
  directory: z.string().min(1, "Project directory is required"),
});

type FormValues = z.infer<typeof formSchema>;

export default function TemplatesListPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [templates, setTemplates] = useState<TemplateDTO[]>([]);
  const [projectSearchPaths, setProjectSearchPaths] = useState<
    { id: string; path: string }[]
  >([]);
  const [open, setOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      projectName: "",
      template: "",
      directory: "",
    },
  });

  useEffect(() => {
    retrieveProjects().then((projects) => {
      if ("error" in projects) {
        console.error("Error retrieving projects:", projects.error);
        toast.error("Error retrieving projects: " + projects.error);
        return;
      }
      setProjects(projects.data || []);
    });
    retrieveTemplates().then((templates) => {
      if ("error" in templates) {
        console.error("Error retrieving templates:", templates.error);
        toast.error("Error retrieving templates: " + templates.error);
        return;
      }
      setTemplates(templates.data || []);
    });
    retrieveProjectSearchPaths().then((paths) => {
      setProjectSearchPaths(paths);
    });
  }, []);

  const onSubmit = useCallback(
    (values: FormValues) => {
      router.push(
        `/projects/instantiate-template/?projectName=${values.projectName}&rootTemplate=${values.template}&template=${values.template}&selectedProjectDirectoryId=${values.directory}`,
      );
      setOpen(false);
      form.reset();
    },
    [form, router],
  );

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

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4 py-4"
            >
              <FormField
                control={form.control}
                name="projectName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My Awesome Project" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="template"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a template" />
                        </SelectTrigger>
                      </FormControl>
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="directory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Directory</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a directory" />
                        </SelectTrigger>
                      </FormControl>
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="submit">Create Project</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    ),
    [open, templates, projectSearchPaths, form, onSubmit],
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
