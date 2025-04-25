"use client";
import { diffProjectFromItsTemplate } from "@/app/actions/git";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ParsedFile, ProjectDTO, Result, TemplateDTO } from "@repo/ts/lib/types";
import { FileDiffIcon, GitBranchIcon, GitCommitIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface ProjectHeaderProps {
  project: ProjectDTO;
  onBranchChange: (branch: string) => void;
  defaultTemplate: TemplateDTO;
}

export function ProjectHeader({ project, defaultTemplate, onBranchChange }: ProjectHeaderProps) {
  const router = useRouter();

  const [isDiffClean, setIsDiffClean] = useState<boolean>(true);

  useEffect(() => {
    diffProjectFromItsTemplate(project.name).then(
      (data: Result<ParsedFile[]>) => {
        if ("error" in data) {
          console.error("Error retrieving project diff:", data.error);
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

        <div className="ml-4 flex items-center gap-8 text-sm">
          {project.gitStatus.isClean ? (
            <Badge className="bg-green-100 text-green-800">Git Clean</Badge>
          ) : (
            <Badge className="bg-red-100 text-red-800">
              Uncommitted Changes
            </Badge>
          )}

          {project.outdatedTemplate ? (
            <Badge className="bg-red-100 text-red-800">
              Newer Template Available
            </Badge>
          ) : (
            <Badge className="bg-green-100 text-green-800">
              Project Up-to-date With Template
            </Badge>
          )}

          {isDiffClean ? (
            <Badge className="bg-blue-100 text-blue-800">
              No Changes from Default Template
            </Badge>
          ) : (
            <Badge className="bg-yellow-100 text-yellow-800">
              Template Changes
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger disabled={!project.gitStatus.isClean} asChild>
            <Button
              disabled={!project.gitStatus.isClean}
              variant="outline"
              className={`flex items-center gap-2 ${project.gitStatus.isClean ? "" : "bg-muted cursor-not-allowed"}`}
            >
              <GitBranchIcon className="w-4 h-4" />
              {project.gitStatus.currentBranch}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {project.gitStatus.branches.map((branch) => (
              <DropdownMenuItem
                disabled={
                  branch === project.gitStatus.currentBranch ||
                  !project.gitStatus.isClean
                }
                key={branch}
                onClick={() => onBranchChange(branch)}
                className={
                  branch === project.gitStatus.currentBranch ||
                    !project.gitStatus.isClean
                    ? "bg-muted"
                    : ""
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
              `/projects/project-staged-changes?projectName=${project.name}`,
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
              `/projects/project-template-diff?projectName=${project.name}`,
            )
          }
        >
          <FileDiffIcon className="w-4 h-4 mr-2" />
          Diff Template
        </Button>

        {/* Add new button to bring templates up to date. Just add a boolean to url saying newRe */}
        <Button
          variant="outline"
          disabled={!project.outdatedTemplate}
          onClick={() =>
            router.push(
              `/projects/instantiate-template/?projectName=${project.settings.projectName}&newRevisionHash=${defaultTemplate.currentCommitHash}`
            )
          }
        >
          <FileDiffIcon className="w-4 h-4 mr-2" />
          Update Template
        </Button>
      </div>
    </header>
  );
}
