"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  DiffHunk,
  ParsedFile,
} from "@timonteutelink/skaff-lib/browser";

interface DiffVisualizerProps {
  file: ParsedFile;
}

export function DiffVisualizer({ file }: DiffVisualizerProps) {
  const [viewMode, setViewMode] = useState<"split" | "unified">("split");

  return (
    <Card className="h-full">
      <CardHeader className="py-3 gap-3 flex flex-col md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium truncate">
              {file.path}
            </CardTitle>
            <FileStatusBadge status={file.status} />
          </div>
          {file.oldPath && file.newPath && file.oldPath !== file.newPath && (
            <p className="text-xs text-muted-foreground truncate">
              Renamed from {file.oldPath}
            </p>
          )}
        </div>
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
        {file.metadata && file.metadata.length > 0 && (
          <div className="border-b border-border px-4 py-2 text-[11px] font-mono text-muted-foreground space-y-1 whitespace-pre-wrap break-words">
            {file.metadata.map((metaLine, index) => (
              <div key={`${metaLine}-${index}`}>{metaLine}</div>
            ))}
          </div>
        )}
        {file.isBinary && file.hunks.length === 0 ? (
          <div className="p-4 text-xs font-mono text-muted-foreground">
            Binary file diff. No textual hunks available.
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-300px)]">
            {viewMode === "split" ? (
              <SplitDiffView file={file} />
            ) : (
              <UnifiedDiffView file={file} />
            )}
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function SplitDiffView({ file }: { file: ParsedFile }) {
  return (
    <div className="grid grid-cols-2 divide-x">
      <div className="p-4">
        {file.status === "added" ? (
          <MissingSideNotice message="File did not exist before this change." />
        ) : (
          <pre className="text-xs font-mono whitespace-pre-wrap break-words">
            {file.hunks.map((hunk, hunkIndex) => (
              <DiffHunkSplit key={hunkIndex} hunk={hunk} side="old" />
            ))}
          </pre>
        )}
      </div>
      <div className="p-4">
        {file.status === "deleted" ? (
          <MissingSideNotice message="File was deleted in this change." />
        ) : (
          <pre className="text-xs font-mono whitespace-pre-wrap break-words">
            {file.hunks.map((hunk, hunkIndex) => (
              <DiffHunkSplit key={hunkIndex} hunk={hunk} side="new" />
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}

function UnifiedDiffView({ file }: { file: ParsedFile }) {
  return (
    <div className="p-4">
      <pre className="text-xs font-mono whitespace-pre-wrap break-words">
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
          <div key={lineIndex} className={`${bgColor} -mx-1 px-1 flex gap-2`}>
            {prefix !== " " && prefix !== "" && prefix !== (side === "old" ? "+" : "-") ? (
              <span className="text-muted-foreground">{prefix}</span>
            ) : null}
            <VisibleWhitespace text={lineContent} />
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
          <div
            key={lineIndex}
            className={`${bgColor} -mx-1 px-1 ${textColor} flex gap-2`}
          >
            <span className="inline-block w-4">{prefix}</span>
            <VisibleWhitespace text={lineContent} />
          </div>
        );
      })}
    </div>
  );
}

function FileStatusBadge({
  status,
}: {
  status: ParsedFile["status"];
}) {
  const colorMap: Record<ParsedFile["status"], string> = {
    added:
      "bg-green-500/10 text-green-600 border border-green-500/20 text-[11px]",
    modified:
      "bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 text-[11px]",
    deleted:
      "bg-red-500/10 text-red-600 border border-red-500/20 text-[11px]",
  };

  return (
    <Badge variant="outline" className={colorMap[status]}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function MissingSideNotice({ message }: { message: string }) {
  return (
    <div className="text-xs text-muted-foreground font-mono border border-dashed border-border rounded-md p-3 bg-muted/50">
      {message}
    </div>
  );
}

function VisibleWhitespace({ text }: { text: string }) {
  if (text.length === 0) {
    return <span className="text-muted-foreground">␀</span>;
  }

  return (
    <span className="whitespace-pre-wrap">
      {Array.from(text).map((char, index) => {
        if (char === " ") {
          return (
            <span key={index} className="text-muted-foreground">
              ·
            </span>
          );
        }
        if (char === "\t") {
          return (
            <span key={index} className="text-muted-foreground">
              →····
            </span>
          );
        }
        return <span key={index}>{char}</span>;
      })}
    </span>
  );
}
