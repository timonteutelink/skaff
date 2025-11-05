"use client";
import { diffProjectFromItsTemplate } from "@/app/actions/git";
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

  useEffect(() => {
    if (!projectRepositoryNameParam) {
      toastNullError({
        shortMessage: "No project repository name provided in search params.",
      });
      router.push("/projects");
      return;
    }

    diffProjectFromItsTemplate(projectRepositoryNameParam).then(
      (diffResult: Result<ParsedFile[]>) => {
        const diff = toastNullError({
          result: diffResult,
          shortMessage: "Error retrieving project diff",
          nullErrorMessage: `Project diff not found for ${projectRepositoryNameParam}`,
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
  }, [projectRepositoryNameParam, router]);

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
          <h1 className="text-xl font-semibold truncate">{projectRepositoryNameParam}</h1>
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
