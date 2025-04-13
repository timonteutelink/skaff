"use client"
import { useRouter } from "next/navigation"
import { GitBranchIcon, GitCommitIcon, CheckCircleIcon, AlertCircleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ProjectDTO } from "@repo/ts/utils/types"

interface ProjectHeaderProps {
  project: ProjectDTO
  onBranchChange: (branch: string) => void
}

export function ProjectHeader({ project, onBranchChange }: ProjectHeaderProps) {
  const router = useRouter()

  return (
    <header className="p-4 border-b border-gray-300 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold">{project.name}</h1>

        <div className="flex items-center gap-2 text-sm">
          {project.gitStatus.isClean ? (
            <div className="flex items-center text-green-600">
              <CheckCircleIcon className="w-4 h-4 mr-1" />
              <span>Clean</span>
            </div>
          ) : (
            <div className="flex items-center text-amber-600">
              <AlertCircleIcon className="w-4 h-4 mr-1" />
              <span>Changes</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2">
              <GitBranchIcon className="w-4 h-4" />
              {project.gitStatus.currentBranch}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {project.gitStatus.branches.map((branch) => (
              <DropdownMenuItem
                key={branch}
                onClick={() => onBranchChange(branch)}
                className={branch === project.gitStatus.currentBranch ? "bg-muted" : ""}
              >
                {branch}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" onClick={() => router.push(`/project-diff-details?projectName=${project.name}`)}>
          <GitCommitIcon className="w-4 h-4 mr-2" />
          Details
        </Button>
      </div>
    </header>
  )
}

