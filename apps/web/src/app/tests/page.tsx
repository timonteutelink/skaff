"use client"

// instead of tests folder maybe use storybook.

import { useCallback, useState } from "react"
import { DiffVisualizer } from "@/components/general/git/diff-visualizer"
import { FileTree } from "@/components/general/git/file-tree"
import { parseGitDiff } from "@/components/general/git/parse-git-diff"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function Home() {
  const [diffText, setDiffText] = useState("")
  const [parsedDiff, setParsedDiff] = useState<ReturnType<typeof parseGitDiff> | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const handleVisualize = useCallback(() => {
    if (!diffText.trim()) return
    const parsed = parseGitDiff(diffText)
    setParsedDiff(parsed)
    if (parsed.files.length > 0) {
      setSelectedFile(parsed.files[0]!.path)
    }
  }, [diffText])

  return (
    <main className="container mx-auto py-6 px-4 min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Git Diff Visualizer</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Input Git Diff</CardTitle>
          <CardDescription>Paste the output of your git diff command below. <br /> <code>git --no-pager diff --no-color --no-ext-diff HEAD~1 | wl-copy</code></CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Paste git diff output here..."
            className="min-h-[200px] font-mono text-sm"
            value={diffText}
            onChange={(e) => setDiffText(e.target.value)}
          />
          <Button onClick={handleVisualize} className="mt-4">
            Visualize Diff
          </Button>
        </CardContent>
      </Card>

      {
        parsedDiff && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-1">
              <FileTree files={parsedDiff.files} selectedFile={selectedFile} onSelectFile={setSelectedFile} />
            </div>
            <div className="md:col-span-3">
              {selectedFile && <DiffVisualizer file={parsedDiff.files.find((f) => f.path === selectedFile)!} />}
            </div>
          </div>
        )
      }
    </main >
  )
}

