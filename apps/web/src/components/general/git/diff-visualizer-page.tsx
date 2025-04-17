'use client';
import { ParsedFile } from "@repo/ts/utils/types"
import { useEffect, useMemo, useState } from "react"
import { FileTree } from "./file-tree"
import { DiffVisualizer } from "./diff-visualizer"

interface DiffVisualizerPageProps {
  projectName: string
  parsedDiff: ParsedFile[]
}

export const DiffVisualizerPage: React.FC<DiffVisualizerPageProps> = ({ projectName, parsedDiff }) => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  useEffect(() => {
    if (parsedDiff.length > 0) {
      setSelectedFile(parsedDiff[0]!.path)
    }
  }, [parsedDiff])

  const currentFile = useMemo(() => parsedDiff.find((f) => f.path === selectedFile), [parsedDiff, selectedFile])

  if (!currentFile) {
    return <div className="text-center text-gray-500">No file selected</div>
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <div className="md:col-span-1">
        <FileTree projectName={projectName} files={parsedDiff} selectedFile={selectedFile} onSelectFile={setSelectedFile} />
      </div>
      <div className="md:col-span-3">
        {selectedFile && <DiffVisualizer file={currentFile} />}
      </div>
    </div>
  )
}
