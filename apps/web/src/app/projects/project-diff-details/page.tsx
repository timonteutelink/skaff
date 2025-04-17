"use client"
import { addAllAndRetrieveCurrentDiff, commitChanges } from "@/app/actions/git"
import { DiffVisualizerPage } from "@/components/general/git/diff-visualizer-page"
import type { ParsedFile, Result } from "@repo/ts/utils/types"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import CommitButton from "@/components/general/git/commit-dialog"
import { toast } from "sonner"

export default function ProjectDiffDetailsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const projectNameParam = useMemo(() => searchParams.get("projectName"), [searchParams])
  const [projectDiff, setProjectDiff] = useState<ParsedFile[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!projectNameParam) {
      console.error("No project name provided in search params.")
      toast.error("No project name provided in search params.")
      router.push("/projects")
      return
    }

    addAllAndRetrieveCurrentDiff(projectNameParam).then((data: Result<ParsedFile[] | null>) => {
      if ("error" in data) {
        console.error("Error retrieving project diff:", data.error)
        toast.error("Error retrieving project diff" + data.error)
        return
      }
      if (!data.data) {
        console.error("Project diff not found:", projectNameParam)
        toast.error("Project diff not found" + projectNameParam)

        router.push("/projects")
        return
      }
      setProjectDiff(data.data)
    })
  }, [projectNameParam, router])

  const handleCommit = useCallback(
    async (message: string) => {
      if (!projectNameParam) return

      setIsLoading(true)
      try {
        const result = await commitChanges(projectNameParam, message)
        if ("error" in result) {
          console.error("Error committing changes:", result.error)
          toast.error("Error committing changes: " + result.error)
          return
        }

        router.push(`/projects/project/?projectName=${projectNameParam}`)
      } catch (error) {
        console.error("Error committing changes:", error)
        toast.error("Error committing changes: " + error)
      } finally {
        setIsLoading(false)
      }
    },
    [projectNameParam, router],
  )

  const handleCancel = useCallback(() => {
  }, [])

  const handleBack = useCallback(() => {
    if (projectNameParam) {
      router.push(`/projects/project/?projectName=${projectNameParam}`)
    } else {
      router.push("/projects")
    }
  }, [projectNameParam, router])

  if (!projectNameParam) {
    return <div>Error: No project name provided.</div>
  }

  if (!projectDiff || isLoading) {
    return <div className="text-center text-gray-500">Loading...</div>
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-4 flex items-center justify-between bg-background sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} aria-label="Back to project">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold truncate">{projectNameParam}</h1>
        </div>
        <div className="flex items-center gap-2">
          <CommitButton onCommit={handleCommit} onCancel={handleCancel} />
        </div>
      </div>

      <div className="flex-1 p-4">
        <DiffVisualizerPage parsedDiff={projectDiff} />
      </div>
    </div>
  )
}

