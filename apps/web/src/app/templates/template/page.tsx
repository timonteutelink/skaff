"use client";

import { retrieveTemplate } from "@/app/actions/template";
import { Tree } from "@/components/general/Tree";
import type { Result, TemplateDTO } from "@repo/ts/utils/types";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CopyIcon } from "lucide-react";

/* =============================================================================
   Template Tree and Helper Functions
   ============================================================================= */
export interface TemplateTreeNode {
  id: string;
  name: string;
  type: "template" | "category";
  data?: TemplateDTO;
  children?: TemplateTreeNode[];
}

const buildTemplateNode = (template: TemplateDTO): TemplateTreeNode => {
  const categoryNodes: TemplateTreeNode[] = Object.entries(
    template.subTemplates,
  ).map(([category, templates]) => {
    const childNodes = templates.map(buildTemplateNode);
    return { id: `${template.dir}-${category}`, name: category, type: "category", children: childNodes };
  });

  return {
    id: template.dir,
    name: template.config.templateConfig.name,
    type: "template",
    data: template,
    children: categoryNodes.length ? categoryNodes : undefined,
  };
};

/* =============================================================================
   Details Panel Component
   ============================================================================= */
interface DetailsPanelProps {
  node: TemplateTreeNode;
}

const DetailsPanel: React.FC<DetailsPanelProps> = ({ node }) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  if (!node.data) {
    return <div className="p-6">No data available for node {node.name}</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header with Name and Type Badge */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold truncate">{node.name}</h2>
        <Badge variant={node.type === "template" ? "secondary" : "outline"}>
          {node.type}
        </Badge>
      </div>

      {/* Key/Value List */}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        {/* Directory */}
        <div>
          <dt className="text-sm font-medium text-gray-700">Directory</dt>
          <dd className="mt-1 flex items-center space-x-2 text-sm text-gray-600">
            <span className="truncate">{node.data?.dir}</span>
            {node.data?.dir && (
              <CopyIcon
                className="w-4 h-4 cursor-pointer"
                onClick={() => handleCopy(node.data!.dir, "dir")}
              />
            )}
            {copiedField === "dir" && <span className="text-xs text-green-500">Copied</span>}
          </dd>
        </div>

        {/* Templates Directory */}
        <div>
          <dt className="text-sm font-medium text-gray-700">Templates Dir</dt>
          <dd className="mt-1 flex items-center space-x-2 text-sm text-gray-600">
            <span className="truncate">{node.data?.templatesDir}</span>
            {node.data?.templatesDir && (
              <CopyIcon
                className="w-4 h-4 cursor-pointer"
                onClick={() => handleCopy(node.data!.templatesDir, "templatesDir")}
              />
            )}
            {copiedField === "templatesDir" && <span className="text-xs text-green-500">Copied</span>}
          </dd>
        </div>

        {/* Reference Directory (optional) */}
        {node.data?.refDir && (
          <div>
            <dt className="text-sm font-medium text-gray-700">Reference Dir</dt>
            <dd className="mt-1 flex items-center space-x-2 text-sm text-gray-600">
              <span className="truncate">{node.data.refDir}</span>
              <CopyIcon
                className="w-4 h-4 cursor-pointer"
                onClick={() => handleCopy(node.data!.refDir!, "refDir")}
              />
              {copiedField === "refDir" && <span className="text-xs text-green-500">Copied</span>}
            </dd>
          </div>
        )}

        {/* Author */}
        <div>
          <dt className="text-sm font-medium text-gray-700">Author</dt>
          <dd className="mt-1 text-sm text-gray-600">
            {node.data?.config.templateConfig.author}
          </dd>
        </div>

        {/* Description (optional) */}
        {node.data?.config.templateConfig.description && (
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-gray-700">Description</dt>
            <dd className="mt-1 text-sm text-gray-600">
              {node.data.config.templateConfig.description}
            </dd>
          </div>
        )}

        {/* Commit Hash */}
        <div>
          <dt className="text-sm font-medium text-gray-700">Commit Hash</dt>
          <dd className="mt-1 flex items-center space-x-2 text-sm text-gray-600">
            <span className="truncate">{node.data?.currentCommitHash}</span>
            {node.data?.currentCommitHash && (
              <CopyIcon
                className="w-4 h-4 cursor-pointer"
                onClick={() => handleCopy(node.data!.currentCommitHash, "currentCommitHash")}
              />
            )}
            {copiedField === "currentCommitHash" && <span className="text-xs text-green-500">Copied</span>}
          </dd>
        </div>
      </dl>

      {/* Collapsible Settings Schema */}
      {node.data && (
        <Collapsible>
          <CollapsibleTrigger className="font-medium">Settings Schema</CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="bg-gray-50 p-4 rounded text-sm overflow-auto">
              {JSON.stringify(node.data.config.templateSettingsSchema, null, 2)}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Raw JSON Fallback */}
      {node.data && (
        <div>
          <h3 className="text-lg font-semibold mb-2">Raw JSON</h3>
          <pre className="bg-gray-50 p-4 rounded text-sm overflow-auto">
            {JSON.stringify(node.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

/* =============================================================================
   TemplateArboristTreePage
   ============================================================================= */
const TemplateArboristTreePage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateName = useMemo(() => searchParams.get("templateName"), [searchParams]);
  const [template, setTemplate] = useState<TemplateDTO>();
  const [selectedNode, setSelectedNode] = useState<TemplateTreeNode | null>(null);

  useEffect(() => {
    if (!templateName) {
      toast.error("No template name provided in search params.");
      console.error("No template name provided in search params.");
      router.push("/templates");
      return;
    }
    retrieveTemplate(templateName).then((data: Result<TemplateDTO | null>) => {
      if ("error" in data) {
        toast.error(data.error);
        console.error("Error retrieving template:", data.error);
        router.push("/templates");
        return;
      }
      if (!data.data) {
        toast.error("Template not found.");
        console.error("Template not found.");
        router.push("/templates");
        return;
      }
      setTemplate(data.data);
    });
  }, [templateName, router]);

  const treeNodes = useMemo(() => (template ? [buildTemplateNode(template)] : []), [template]);
  const handleSelect = useCallback((node: TemplateTreeNode) => setSelectedNode(node), []);

  if (!template) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-lg">Loading templates...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Left side: Tree view */}
      <div className="w-1/3 border-r border-gray-300 overflow-auto">
        <header className="p-4 border-b border-gray-300">
          <h1 className="text-3xl font-bold">Templates Tree</h1>
        </header>
        <div className="p-4">
          <Tree<TemplateTreeNode>
            data={treeNodes}
            onSelect={handleSelect}
            selectedId={selectedNode?.id}
            openByDefault={false}
            rowHeight={40}
            width="100%"
          />
        </div>
      </div>

      {/* Right side: Details panel */}
      <div className="w-2/3 overflow-auto p-6">
        {selectedNode ? <DetailsPanel node={selectedNode} /> : (
          <div className="p-6">
            <h2 className="text-2xl font-bold">Select a template from the tree</h2>
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateArboristTreePage;

