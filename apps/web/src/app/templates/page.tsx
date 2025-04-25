"use client";
import { eraseCache, reloadTemplates, retrieveDefaultTemplates } from "@/app/actions/template";
import { ConfirmationDialog } from "@/components/general/confirmation-dialog";
import TablePage, { FieldInfo } from "@/components/general/table-page";
import { DefaultTemplateResult } from "@repo/ts/lib/types";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const columnMapping: FieldInfo<DefaultTemplateResult>[] = [
  {
    name: "Name",
    data: (item) => item.template.config.templateConfig.name,
  },
  {
    name: "Directory",
    data: (item) => item.template.dir,
  },
  {
    name: "Revisions",
    data: (item) => item.revisions.length,
  }
];

export default function TemplatesListPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<DefaultTemplateResult[]>([]);

  useEffect(() => {
    retrieveDefaultTemplates().then((templates) => {
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
  </>), [handleReload, handleClearCache]);

  return (
    <TablePage<DefaultTemplateResult>
      buttons={templateButtons}
      title="Detected Templates"
      data={templates}
      columnMapping={columnMapping}
      caption="A list of your templates."
      onClick={(item) => {
        router.push(
          `/templates/template?templateName=${item.template.config.templateConfig.name}`,
        );
      }}
    />
  );
}
