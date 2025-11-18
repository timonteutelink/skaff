"use client";
import {
  runEraseCache,
  reloadTemplates,
  retrieveTemplates,
  loadTemplateRepo,
} from "@/app/actions/template";
import { ConfirmationDialog } from "@/components/general/confirmation-dialog";
import { GitRepoSelectionDialog } from "@/components/general/git-repo-selection-dialog";
import TablePage, { FieldInfo } from "@/components/general/table-page";
import { toastNullError } from "@/lib/utils";
import { TemplateSummary } from "@timonteutelink/skaff-lib/browser";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const columnMapping: FieldInfo<TemplateSummary>[] = [
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
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const handleLoadTemplateRepo = useCallback(
    async (repoUrl: string, branch?: string, revision?: string) => {
      const loadResult = await loadTemplateRepo(repoUrl, branch, revision);
      const repoLoaded = toastNullError({
        result: loadResult,
        shortMessage: "Error loading repo",
      });
      if (!repoLoaded) {
        return;
      }

      if (repoLoaded.alreadyExisted) {
        toast.info("Repository is already loaded. Use the refresh action to fetch the latest revision.");
        return;
      }

      const templatesResult = await retrieveTemplates();
      const newTemplates = toastNullError({
        result: templatesResult,
        shortMessage: "Error retrieving templates",
      });
      if (!newTemplates) {
        return;
      }

      setTemplates(newTemplates);
      toast.success("Repository loaded");
    },
    [],
  );

  useEffect(() => {
    retrieveTemplates().then((templatesResult) => {
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

  const templateButtons = useMemo(
    () => (
      <>
        <GitRepoSelectionDialog
          buttonText="Load from Repository"
          actionText="Load Template Repo"
          onConfirm={handleLoadTemplateRepo}
        />
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
      </>
    ),
    [handleLoadTemplateRepo, handleReload, handleClearCache],
  );

  return (
    <TablePage<TemplateSummary>
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
