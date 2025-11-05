"use client";
import { commitChanges } from "@/app/actions/git";
import { resolveConflictsAndDiff } from "@/app/actions/instantiate";
import CommitButton from "@/components/general/git/commit-dialog";
import { DiffVisualizerPage } from "@/components/general/git/diff-visualizer-page";
import { Button } from "@/components/ui/button";
import { toastNullError } from "@/lib/utils";
import type {
  ParsedFile,
  Result,
} from "@timonteutelink/skaff-lib/browser";
import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export default function ProjectStagedChangesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectRepositoryNameParam = useMemo(
    () => searchParams.get("projectRepositoryName"),
    [searchParams],
  );
  const [projectDiff, setProjectDiff] = useState<ParsedFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!projectRepositoryNameParam) {
      toastNullError({
        shortMessage: "No project repository name provided in search params.",
      });
      router.push("/projects");
      return;
    }

    resolveConflictsAndDiff(projectRepositoryNameParam).then(
      (data: Result<ParsedFile[] | null>) => {
        const toastResult = toastNullError({
          result: data,
          shortMessage: "Error retrieving project diff",
          nullErrorMessage: `Project diff not found for ${projectRepositoryNameParam}`,
          nullRedirectPath: "/projects",
        });
        if (!toastResult) {
          return;
        }
        setProjectDiff(toastResult);
      },
    );
  }, [projectRepositoryNameParam, router]);

  const handleCommit = useCallback(
    async (message: string) => {
      if (!projectRepositoryNameParam) return;

      setIsLoading(true);
      try {
        const result = await commitChanges(projectRepositoryNameParam, message);

        const toastResult = toastNullError({
          result,
          shortMessage: "Error committing changes",
        });
        if (!toastResult) {
          return;
        }

        router.push(`/projects/project/?projectRepositoryName=${projectRepositoryNameParam}`);
      } catch (error) {
        toastNullError({
          error,
          shortMessage: "Error committing changes",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [projectRepositoryNameParam, router],
  );

  const handleCancel = useCallback(() => { }, []);

  const handleBack = useCallback(() => {
    if (projectRepositoryNameParam) {
      router.push(`/projects/project/?projectRepositoryName=${projectRepositoryNameParam}`);
    } else {
      router.push("/projects");
    }
  }, [projectRepositoryNameParam, router]);

  if (!projectRepositoryNameParam) {
    return <div>Error: No project repository name provided.</div>;
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
          <h1 className="text-xl font-semibold truncate">{projectRepositoryNameParam}</h1>
        </div>
        <div className="flex items-center gap-2">
          <CommitButton onCommit={handleCommit} onCancel={handleCancel} />
        </div>
      </div>

      <div className="flex-1 p-4">
        <DiffVisualizerPage
          projectRepositoryName={projectRepositoryNameParam}
          parsedDiff={projectDiff}
        />
      </div>
    </div>
  );
}
