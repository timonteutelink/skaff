"use client";
import {
  runEraseCache,
  reloadTemplates,
  retrieveDefaultTemplates,
  loadTemplatesFromRepo,
} from "@/app/actions/template";
import { ConfirmationDialog } from "@/components/general/confirmation-dialog";
import TablePage, { FieldInfo } from "@/components/general/table-page";
import { Button } from "@/components/ui/button";
import { toastNullError } from "@/lib/utils";
import { DefaultTemplateResult } from "@timonteutelink/skaff-lib/browser";
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
  },
];

export default function TemplatesListPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<DefaultTemplateResult[]>([]);

  useEffect(() => {
    retrieveDefaultTemplates().then((templatesResult) => {
      const templates = toastNullError({
        result: templatesResult,
        shortMessage: "Error retrieving templates",
      });
      if (!templates) {
        return;
      }
      setTemplates(templates);
    });
  }, []);

  const handleReload = useCallback(async () => {
    const result = await reloadTemplates();
    const toastResult = toastNullError({
      result,
      shortMessage: "Error reloading templates",
    });
    if (!toastResult) {
      if ("error" in result) {
        return { error: result.error };
      } else {
        return { error: "Unknown error" };
      }
    }
    setTemplates(toastResult);
    toast.success("Templates reloaded successfully");
    return { data: undefined };
  }, []);

  const handleClearCache = useCallback(async () => {
    const result = await runEraseCache();
    const toastResult = toastNullError({
      result,
      shortMessage: "Error clearing cache",
    });
    if (!toastResult) {
      if ("error" in result) {
        return { error: result.error };
      } else {
        return { error: "Unknown error" };
      }
    }
    setTemplates(toastResult);
    toast.success("Cache cleared successfully");
    return { data: undefined };
  }, []);

  const handleLoadFromRepo = useCallback(async () => {
    const repoUrl = prompt("Git repository URL");
    if (!repoUrl) {
      return { error: "No repository URL provided" } as const;
    }
    const branch = prompt("Branch", "main") || "main";
    const result = await loadTemplatesFromRepo(repoUrl, branch);
    const toastResult = toastNullError({
      result,
      shortMessage: "Error loading templates",
    });
    if (!toastResult) {
      if ("error" in result) {
        return { error: result.error } as const;
      } else {
        return { error: "Unknown error" } as const;
      }
    }
    setTemplates(toastResult);
    toast.success("Templates loaded successfully");
    return { data: undefined } as const;
  }, []);

  const templateButtons = useMemo(
    () => (
      <>
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
        <Button onClick={handleLoadFromRepo}>Load From Repo</Button>
      </>
    ),
    [handleReload, handleClearCache, handleLoadFromRepo],
  );

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
