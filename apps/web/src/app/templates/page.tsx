"use client";
import { retrieveTemplates } from "@/app/actions/template";
import TablePage, { FieldInfo } from "@/components/general/TablePage";
import { TemplateDTO } from "@repo/ts/utils/types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const columnMapping: FieldInfo<TemplateDTO>[] = [
  {
    name: "Name",
    data: (item: TemplateDTO) => item.config.templateConfig.name,
  },
  {
    name: "Directory",
    data: (item: TemplateDTO) => item.dir,
  },
];

export default function TemplatesListPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateDTO[]>([]);

  useEffect(() => {
    retrieveTemplates().then((templates) => {
      if ("error" in templates) {
        console.error("Error retrieving templates:", templates.error);
        toast.error("Error retrieving templates: " + templates.error);
        return;
      }
      setTemplates(templates.data);
    });
  }, []);

  return (
    <TablePage<TemplateDTO>
      title="Detected Templates"
      data={templates}
      columnMapping={columnMapping}
      caption="A list of your templates."
      onClick={(item) => {
        router.push(
          `/templates/template?templateName=${item.config.templateConfig.name}`,
        );
      }}
    />
  );
}
