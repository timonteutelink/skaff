"use client";
import { diffProjectFromItsTemplate } from "@/app/actions/git";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ParsedFile, ProjectDTO, Result } from "@repo/ts/utils/types";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  FileDiffIcon,
  GitBranchIcon,
  GitCommitIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface ProjectHeaderProps {
  project: ProjectDTO;
  onBranchChange: (branch: string) => void;
}

export function ProjectHeader({ project, onBranchChange }: ProjectHeaderProps) {
  const router = useRouter();

  const [isDiffClean, setIsDiffClean] = useState<boolean>(true);

  useEffect(() => {
    diffProjectFromItsTemplate(project.name).then(
      (data: Result<ParsedFile[]>) => {
        if ("error" in data) {
          console.log("Error retrieving project diff:", data.error);
          setIsDiffClean(true);
          return;
        }
        setIsDiffClean(data.data.length === 0);
      },
    );
  }, [project]);

  return (
    <header className="p-4 border-b border-gray-300 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold">{project.name}</h1>

        <div className="flex items-center gap-2 text-sm">
          {project.outdatedTemplate ? (
            <div className="flex items-center text-amber-600">
              <AlertCircleIcon className="w-4 h-4 mr-1" />
              <span>Newer Template Available</span>
            </div>
          ) : (
            <div className="flex items-center text-green-600">
              <CheckCircleIcon className="w-4 h-4 mr-1" />
              <span>Project Up-to-date</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger disabled={!project.gitStatus.isClean} asChild>
            <Button disabled={!project.gitStatus.isClean} variant="outline" className={`flex items-center gap-2 ${project.gitStatus.isClean ? '' : 'bg-muted cursor-not-allowed'}`}>
              <GitBranchIcon className="w-4 h-4" />
              {project.gitStatus.currentBranch}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {project.gitStatus.branches.map((branch) => (
              <DropdownMenuItem
                disabled={branch === project.gitStatus.currentBranch || !project.gitStatus.isClean}
                key={branch}
                onClick={() => onBranchChange(branch)}
                className={
                  branch === project.gitStatus.currentBranch || !project.gitStatus.isClean ? 'bg-muted' : ''
                }
              >
                {branch}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Details / No Changes button, disabled when clean git repo */}
        <Button
          variant="outline"
          disabled={project.gitStatus.isClean}
          onClick={() =>
            router.push(
              `/projects/project-staged-changes?projectName=${project.name}`
            )
          }
        >
          <GitCommitIcon className="w-4 h-4 mr-2" />
          {project.gitStatus.isClean ? "No Changes" : "Details"}
        </Button>

        {/* template diff button is disabled when project is same as newly templated project of same settings */}
        <Button
          variant="outline"
          disabled={isDiffClean}
          onClick={() =>
            router.push(
              `/projects/project-template-diff?projectName=${project.name}`
            )
          }
        >
          <FileDiffIcon className="w-4 h-4 mr-2" />
          Diff Template
        </Button>
      </div>
    </header>
  );
}

