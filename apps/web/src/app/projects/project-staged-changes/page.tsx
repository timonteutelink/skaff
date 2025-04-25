"use client";
import { addAllAndRetrieveCurrentDiff, commitChanges } from "@/app/actions/git";
import CommitButton from "@/components/general/git/commit-dialog";
import { DiffVisualizerPage } from "@/components/general/git/diff-visualizer-page";
import { Button } from "@/components/ui/button";
import { toastNullError } from "@/lib/utils";
import type { ParsedFile, Result } from "@repo/ts/lib/types";
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
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!projectNameParam) {
      toastNullError({
        shortMessage: "No project name provided in search params.",
      });
      router.push("/projects");
      return;
    }

    addAllAndRetrieveCurrentDiff(projectNameParam).then(
      (data: Result<ParsedFile[] | null>) => {
        const toastResult = toastNullError({
          result: data,
          shortMessage: "Error retrieving project diff",
          nullErrorMessage: `Project diff not found for ${projectNameParam}`,
          nullRedirectPath: "/projects",
        });
        if (!toastResult) {
          return;
        }
        setProjectDiff(toastResult);
      },
    );
  }, [projectNameParam, router]);

  const handleCommit = useCallback(
    async (message: string) => {
      if (!projectNameParam) return;

      setIsLoading(true);
      try {
        const result = await commitChanges(projectNameParam, message);

        const toastResult = toastNullError({ result, shortMessage: "Error committing changes" });
        if (!toastResult) {
          return;
        }

        router.push(`/projects/project/?projectName=${projectNameParam}`);
      } catch (error) {
        toastNullError({
          error,
          shortMessage: "Error committing changes",
        })

      } finally {
        setIsLoading(false);
      }
    },
    [projectNameParam, router],
  );

  const handleCancel = useCallback(() => { }, []);

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

  if (!projectDiff || isLoading) {
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
        <div className="flex items-center gap-2">
          <CommitButton onCommit={handleCommit} onCancel={handleCancel} />
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
