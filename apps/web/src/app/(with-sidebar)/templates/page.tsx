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

	const loadTheTemplateRepo = useCallback(async (repoUrl: string, branch: string) => {
		const result = await loadTemplateRepo(repoUrl, branch);
		toastNullError({
			result,
			shortMessage: "Error loading repo",
		});
		const templatesRes = await retrieveTemplates();
		const newTemplates = toastNullError({
			result: templatesRes,
			shortMessage: "Error retrieving templates",
		});
		if (newTemplates) {
			setTemplates(newTemplates);
			toast.success("Repo loaded");
		}
	}, [])

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
				  buttonText="Load from Github"
				  actionText="Load Template Repo"
					onConfirm={loadTheTemplateRepo}
					onCancel={async () => {}}
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
    [handleReload, handleClearCache],
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
