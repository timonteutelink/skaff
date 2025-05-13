"use client";
import { diffProjectFromItsTemplate } from "@/app/actions/git";
import { DiffVisualizerPage } from "@/components/general/git/diff-visualizer-page";
import { Button } from "@/components/ui/button";
import { toastNullError } from "@/lib/utils";
import type { ParsedFile, Result } from "@repo/code-templator-lib/lib/types";
import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export default function ProjectStagedChangesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectNameParam = useMemo(
    () => searchParams.get("projectName"),
    [searchParams],
  );
  const [projectDiff, setProjectDiff] = useState<ParsedFile[]>([]);

  useEffect(() => {
    if (!projectNameParam) {
      toastNullError({
        shortMessage: "No project name provided in search params.",
      });
      router.push("/projects");
      return;
    }

    diffProjectFromItsTemplate(projectNameParam).then(
      (diffResult: Result<ParsedFile[]>) => {
        const diff = toastNullError({
          result: diffResult,
          shortMessage: "Error retrieving project diff",
          nullErrorMessage: `Project diff not found for ${projectNameParam}`,
          nullRedirectPath: "/projects",
        });

        if (!diff) {
          return;
        }

        if (diff.length === 0) {
          toastNullError({
            shortMessage: "No changes found in project diff",
          });
          router.push("/projects");
          return;
        }
        setProjectDiff(diff);
      },
    );
  }, [projectNameParam, router]);

  const handleBack = useCallback(() => {
    if (projectNameParam) {
      router.push(`/projects/project/?projectName=${projectNameParam}`);
    } else {
      router.push("/projects");
    }
  }, [projectNameParam, router]);

  if (!projectNameParam) {
    return <div>Error: No project name provided.</div>;
  }

  if (!projectDiff) {
    return <div className="text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-4 flex items-center justify-between bg-background sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            aria-label="Back to project"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold truncate">{projectNameParam}</h1>
        </div>
      </div>

      <div className="flex-1 p-4">
        <DiffVisualizerPage
          projectName={projectNameParam}
          parsedDiff={projectDiff}
        />
      </div>
    </div>
  );
}
