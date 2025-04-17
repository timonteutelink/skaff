"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DiffHunk, ParsedFile } from "@repo/ts/utils/types";

interface DiffVisualizerProps {
  file: ParsedFile;
}

export function DiffVisualizer({ file }: DiffVisualizerProps) {
  const [viewMode, setViewMode] = useState<"split" | "unified">("split");

  return (
    <Card className="h-full">
      <CardHeader className="py-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium truncate">
          {file.path}
        </CardTitle>
        <Tabs
          value={viewMode}
          onValueChange={(v) => setViewMode(v as "split" | "unified")}
        >
          <TabsList className="grid w-[200px] grid-cols-2">
            <TabsTrigger value="split">Split View</TabsTrigger>
            <TabsTrigger value="unified">Unified View</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[calc(100vh-450px)]">
          {viewMode === "split" ? (
            <SplitDiffView file={file} />
          ) : (
            <UnifiedDiffView file={file} />
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function SplitDiffView({ file }: { file: ParsedFile }) {
  return (
    <div className="grid grid-cols-2 divide-x">
      <div className="p-4">
        <pre className="text-xs font-mono whitespace-pre-wrap">
          {file.hunks.map((hunk, hunkIndex) => (
            <DiffHunkSplit key={hunkIndex} hunk={hunk} side="old" />
          ))}
        </pre>
      </div>
      <div className="p-4">
        <pre className="text-xs font-mono whitespace-pre-wrap">
          {file.hunks.map((hunk, hunkIndex) => (
            <DiffHunkSplit key={hunkIndex} hunk={hunk} side="new" />
          ))}
        </pre>
      </div>
    </div>
  );
}

function UnifiedDiffView({ file }: { file: ParsedFile }) {
  return (
    <div className="p-4">
      <pre className="text-xs font-mono whitespace-pre-wrap">
        {file.hunks.map((hunk, hunkIndex) => (
          <DiffHunkUnified key={hunkIndex} hunk={hunk} />
        ))}
      </pre>
    </div>
  );
}

function DiffHunkSplit({
  hunk,
  side,
}: {
  hunk: DiffHunk;
  side: "old" | "new";
}) {
  return (
    <div className="mb-4">
      <div className="text-xs text-muted-foreground mb-2 bg-muted p-1">
        {side === "old"
          ? `@@ -${hunk.oldStart},${hunk.oldLines} @@`
          : `@@ +${hunk.newStart},${hunk.newLines} @@`}
      </div>
      {hunk.lines.map((line, lineIndex) => {
        const prefix = line.charAt(0);

        // Skip lines that don't belong to this side
        if (
          (side === "old" && prefix === "+") ||
          (side === "new" && prefix === "-")
        ) {
          return null;
        }

        const lineContent = line.substring(1);
        let bgColor = "";

        if (prefix === "+" && side === "new") {
          bgColor = "bg-green-500/10";
        } else if (prefix === "-" && side === "old") {
          bgColor = "bg-red-500/10";
        }

        return (
          <div key={lineIndex} className={`${bgColor} -mx-1 px-1`}>
            {lineContent}
          </div>
        );
      })}
    </div>
  );
}

function DiffHunkUnified({ hunk }: { hunk: DiffHunk }) {
  return (
    <div className="mb-4">
      <div className="text-xs text-muted-foreground mb-2 bg-muted p-1">
        {`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`}
      </div>
      {hunk.lines.map((line, lineIndex) => {
        const prefix = line.charAt(0);
        const lineContent = line.substring(1);
        let bgColor = "";
        let textColor = "";

        if (prefix === "+") {
          bgColor = "bg-green-500/10";
          textColor = "text-green-700";
        } else if (prefix === "-") {
          bgColor = "bg-red-500/10";
          textColor = "text-red-700";
        }

        return (
          <div key={lineIndex} className={`${bgColor} -mx-1 px-1 ${textColor}`}>
            <span className="inline-block w-4">{prefix}</span>
            {lineContent}
          </div>
        );
      })}
    </div>
  );
}
