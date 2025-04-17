"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, File, FileCode, FileText, Folder } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ParsedFile } from "@repo/ts/utils/types"

interface FileTreeProps {
  projectName: string
  files: ParsedFile[]
  selectedFile: string | null
  onSelectFile: (path: string) => void
}

export function FileTree({ projectName, files, selectedFile, onSelectFile }: FileTreeProps) {
  // Group files by directory
  const fileTree = useMemo(() => buildFileTree(projectName, files), [files])

  return (
    <Card className="h-full">
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-medium">Changed Files</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100vh-450px)]">
          <div className="p-2">
            <TreeNode node={fileTree} level={0} selectedFile={selectedFile} onSelectFile={onSelectFile} />
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

interface TreeNode {
  name: string
  path: string
  type: "file" | "directory"
  status?: "added" | "modified" | "deleted"
  children?: TreeNode[]
}

interface TreeNodeProps {
  node: TreeNode
  level: number
  selectedFile: string | null
  onSelectFile: (path: string) => void
}

function TreeNode({ node, level, selectedFile, onSelectFile }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true)

  if (node.type === "file") {
    return (
      <div
        className={cn(
          "flex items-center py-1 px-2 rounded-md cursor-pointer hover:bg-muted transition-colors",
          selectedFile === node.path && "bg-muted",
        )}
        style={{ paddingLeft: `${(level + 1) * 12}px` }}
        onClick={() => onSelectFile(node.path)}
      >
        <FileIcon status={node.status} />
        <span className="ml-2 text-sm truncate">{node.name}</span>
        {node.status && <StatusBadge status={node.status} />}
      </div>
    )
  }

  return (
    <div>
      <div
        className="flex items-center py-1 px-2 rounded-md cursor-pointer hover:bg-muted transition-colors"
        style={{ paddingLeft: `${level * 12}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        <Button variant="ghost" size="icon" className="h-4 w-4 p-0 mr-1">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
        <Folder className="h-4 w-4 text-muted-foreground" />
        <span className="ml-2 text-sm font-medium">{node.name}</span>
      </div>

      {expanded && node.children && (
        <div>
          {node.children.map((child, index) => (
            <TreeNode
              key={index}
              node={child}
              level={level + 1}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FileIcon({ status }: { status?: "added" | "modified" | "deleted" }) {
  if (status === "added") {
    return <FileText className="h-4 w-4 text-green-500" />
  }
  if (status === "deleted") {
    return <FileText className="h-4 w-4 text-red-500" />
  }
  if (status === "modified") {
    return <FileCode className="h-4 w-4 text-yellow-500" />
  }
  return <File className="h-4 w-4 text-muted-foreground" />
}

function StatusBadge({ status }: { status: "added" | "modified" | "deleted" }) {
  if (status === "added") {
    return (
      <Badge variant="outline" className="ml-auto text-xs bg-green-500/10 text-green-500 border-green-500/20">
        Added
      </Badge>
    )
  }
  if (status === "deleted") {
    return (
      <Badge variant="outline" className="ml-auto text-xs bg-red-500/10 text-red-500 border-red-500/20">
        Deleted
      </Badge>
    )
  }
  if (status === "modified") {
    return (
      <Badge variant="outline" className="ml-auto text-xs bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
        Modified
      </Badge>
    )
  }
  return null
}

// Helper function to build a file tree from a flat list of files
function buildFileTree(projectName: string, files: ParsedFile[]): TreeNode {
  const root: TreeNode = {
    name: projectName,
    path: "",
    type: "directory",
    children: [],
  }

  for (const file of files) {
    const pathParts = file.path.split("/")
    let currentNode = root

    // Create directory nodes
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i]!;
      const path = pathParts.slice(0, i + 1).join("/")

      let childNode = currentNode.children?.find((child) => child.name === part)

      if (!childNode) {
        childNode = {
          name: part,
          path,
          type: "directory",
          children: [],
        }
        currentNode.children = currentNode.children || []
        currentNode.children.push(childNode)
      }

      currentNode = childNode
    }

    // Add file node
    const fileName = pathParts[pathParts.length - 1]!;
    currentNode.children = currentNode.children || []
    currentNode.children.push({
      name: fileName,
      path: file.path,
      type: "file",
      status: file.status,
    })
  }

  return root
}

