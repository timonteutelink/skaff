"use client";
import { eraseCache, reloadTemplates, retrieveTemplates } from "@/app/actions/template";
import { ConfirmationDialog } from "@/components/general/confirmation-dialog";
import TablePage, { FieldInfo } from "@/components/general/table-page";
import { Badge } from "@/components/ui/badge";
import { TemplateDTO } from "@repo/ts/utils/types";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  {
    name: "Commit Hash",
    data: (item: TemplateDTO) => (
      <Badge
        variant="outline"
        className="text-xs text-muted-foreground"
        title={item.currentCommitHash}
      >
        {item.currentCommitHash.slice(0, 7)}
      </Badge>
    ),
  }
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

  const handleReload = useCallback(async () => {
    const result = await reloadTemplates();
    if ("error" in result) {
      console.error("Error reloading templates:", result.error);
      toast.error("Error reloading templates: " + result.error);
      return { error: result.error };
    }
    setTemplates(result.data);
    toast.success("Templates reloaded successfully");
    return { data: undefined };
  }, []);

  const handleClearCache = useCallback(async () => {
    const result = await eraseCache();
    if ("error" in result) {
      console.error("Error clearing cache:", result.error);
      toast.error("Error clearing cache: " + result.error);
      return { error: result.error };
    }
    setTemplates(result.data);
    toast.success("Cache cleared successfully");
    return { data: undefined };
  }, []);

  const templateButtons = useMemo(() => (<>
    <ConfirmationDialog
      buttonText="Reload Templates"
      actionText="Reload"
      dialogTitle="Reload Templates"
      dialogDescription="Are you sure you want to reload all templates?"
      onConfirm={handleReload}
    />
    <ConfirmationDialog
      buttonText="Clear Cache"
      actionText="Clear"
      dialogTitle="Clear Cache"
      dialogDescription="Are you sure you want to clear the cache? This action cannot be undone."
      onConfirm={handleClearCache}
    />
  </>), []);

  return (
    <TablePage<TemplateDTO>
      buttons={templateButtons}
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
