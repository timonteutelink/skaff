"use client";
import {
  retrieveProjects,
  retrieveProjectSearchPaths,
  retrieveProjectPluginNotices,
} from "@/app/actions/project";
import { retrieveTemplates } from "@/app/actions/template";
import TablePage, { type FieldInfo } from "@/components/general/table-page";
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
import { toastNullError } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type ProjectDTO,
  type TemplateDTO,
} from "@timonteutelink/skaff-lib/browser";
import { projectRepositoryNameRegex } from "@timonteutelink/template-types-lib";
import { PlusCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
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
  projectRepositoryName: z
    .string()
    .min(1, "Project repository name is required")
    .regex(
      projectRepositoryNameRegex,
      "Project repository name can only contain letters, numbers, dashes and underscores.",
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
  const [pluginNotices, setPluginNotices] = useState<Record<string, string[]>>(
    {},
  );
  const [open, setOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema as any),
    defaultValues: {
      projectRepositoryName: "",
      template: "",
      directory: "",
    },
  });

  useEffect(() => {
    retrieveProjects().then((projectsResult) => {
      const projects = toastNullError({
        result: projectsResult,
        shortMessage: "Error retrieving projects",
      });
      if (!projects) {
        return [];
      }
      setProjects(projects || []);
    });
    retrieveTemplates().then((templatesResult) => {
      const templates = toastNullError({
        result: templatesResult,
        shortMessage: "Error retrieving templates",
      });
      if (!templates) {
        return [];
      }
      setTemplates(templates.map((t) => t.template) || []);
    });
    retrieveProjectSearchPaths().then((paths) => {
      setProjectSearchPaths(paths);
    });
  }, []);

  useEffect(() => {
    if (!projects.length) {
      setPluginNotices({});
      return;
    }

    let canceled = false;

    Promise.all(
      projects.map(async (project) => {
        const notices = await retrieveProjectPluginNotices(project.name);
        if ("error" in notices || !notices.data) {
          return [project.name, []] as const;
        }
        return [project.name, notices.data.notices] as const;
      }),
    ).then((entries) => {
      if (!canceled) {
        setPluginNotices(Object.fromEntries(entries));
      }
    });

    return () => {
      canceled = true;
    };
  }, [projects]);

  const onSubmit = useCallback(
    (values: FormValues) => {
      router.push(
        `/projects/instantiate-template/?projectRepositoryName=${values.projectRepositoryName}&template=${values.template}&selectedProjectDirectoryId=${values.directory}`,
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
                name="projectRepositoryName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Repository Name</FormLabel>
                    <FormControl>
                      <Input placeholder="my-awesome-project" {...field} />
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
    <div className="space-y-6">
      <TablePage<ProjectDTO>
        title="Detected Projects"
        data={projects}
        columnMapping={columnMapping}
        caption="A list of your projects."
        buttons={createProjectDialog}
        onClick={(item) => {
          router.push(`/projects/project?projectRepositoryName=${item.name}`);
        }}
      />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Plugin notices</h2>
        {projects.map((project) => {
          const notices = pluginNotices[project.name] || [];
          return (
            <div
              key={project.name}
              className="rounded-md border border-border p-4"
            >
              <div className="font-medium">{project.name}</div>
              {notices.length ? (
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {notices.map((notice, index) => (
                    <li key={`${project.name}-${index}`}>{notice}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No plugin notices for this project yet.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
