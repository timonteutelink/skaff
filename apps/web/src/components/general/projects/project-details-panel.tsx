"use client"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import type { ProjectTreeNode } from "./types"

interface ProjectDetailsPanelProps {
  selectedNode: ProjectTreeNode | null
  projectName: string | null
  project: any // Using any for now, replace with proper type
}

export function ProjectDetailsPanel({ selectedNode, projectName, project }: ProjectDetailsPanelProps) {
  const router = useRouter()

  if (!selectedNode) {
    return (
      <div>
        <h2 className="text-2xl font-bold">Select a node from the tree</h2>
      </div>
    )
  }

  if (selectedNode.type === "instantiated") {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">{selectedNode.name}</h2>
        <pre className="bg-gray-100 p-4 rounded text-sm">{JSON.stringify(selectedNode.instanceData, null, 2)}</pre>
      </div>
    )
  }

  if (selectedNode.type === "subCategory") {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Sub Template Category: {selectedNode.name}</h2>
        <pre className="bg-gray-100 p-4 rounded text-sm">{JSON.stringify(selectedNode, null, 2)}</pre>
      </div>
    )
  }

  if (selectedNode.type === "childTemplate") {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">
          Child Template: {selectedNode.templateDefinition.config.templateConfig.name}
        </h2>
        <pre className="bg-gray-100 p-4 rounded text-sm">
          {JSON.stringify(selectedNode.templateDefinition, null, 2)}
        </pre>
      </div>
    )
  }

  if (selectedNode.type === "createInstance") {
    const candidate = selectedNode.candidateTemplate
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Create New Instance</h2>
        <p className="mb-4 text-sm">
          This will create a new <span className="font-medium">{candidate.config.templateConfig.name}</span> instance
          under the parent with ID <span className="font-medium">{selectedNode.parentId}</span>.
        </p>
        <Button
          disabled={!projectName || !project}
          onClick={() => {
            router.push(
              `/projects/instantiate-template/?projectName=${projectName}&rootTemplate=${project?.rootTemplateName}&template=${candidate.config.templateConfig.name}&parentTemplateInstanceId=${selectedNode.parentId}`,
            )
          }}
        >
          Create
        </Button>
      </div>
    )
  }

  return null
}

