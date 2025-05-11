"use client"

import { Tree } from "@/components/general/tree"
import type { Result, TemplateDTO } from "@timonteutelink/code-templator-lib/lib/types"
import { useRouter, useSearchParams } from "next/navigation"
import type React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { retrieveAllTemplateRevisions } from "@/app/actions/template"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toastNullError } from "@/lib/utils"
import { CopyIcon } from "lucide-react"

/* =============================================================================
   Template Tree and Helper Functions
   ============================================================================= */
export interface TemplateTreeNode {
  id: string
  name: string
  type: "template" | "category"
  data?: TemplateDTO
  children?: TemplateTreeNode[]
}

const buildTemplateNode = (template: TemplateDTO): TemplateTreeNode => {
  const categoryNodes: TemplateTreeNode[] = Object.entries(template.subTemplates).map(([category, templates]) => {
    const childNodes = templates.map(buildTemplateNode)
    return {
      id: `${template.dir}-${category}`,
      name: category,
      type: "category",
      children: childNodes,
    }
  })

  return {
    id: template.dir,
    name: template.config.templateConfig.name,
    type: "template",
    data: template,
    children: categoryNodes.length ? categoryNodes : undefined,
  }
}

/* =============================================================================
   Details Panel Component
   ============================================================================= */
interface DetailsPanelProps {
  node: TemplateTreeNode
}

const DetailsPanel: React.FC<DetailsPanelProps> = ({ node }) => {
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const handleCopy = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }, [])

  if (!node.data) {
    return <div className="p-6">No data available for node {node.name}</div>
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header with Name and Type Badge */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold truncate">{node.name}</h2>
        <Badge variant={node.type === "template" ? "secondary" : "outline"}>{node.type}</Badge>
      </div>

      {/* Key/Value List */}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
        {/* Directory */}
        <div>
          <dt className="text-sm font-medium text-gray-700">Directory</dt>
          <dd className="mt-1 flex items-center space-x-2 text-sm text-gray-600">
            <span className="truncate">{node.data?.dir}</span>
            {node.data?.dir && (
              <CopyIcon className="w-4 h-4 cursor-pointer" onClick={() => handleCopy(node.data!.dir, "dir")} />
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
              <CopyIcon className="w-4 h-4 cursor-pointer" onClick={() => handleCopy(node.data!.refDir!, "refDir")} />
              {copiedField === "refDir" && <span className="text-xs text-green-500">Copied</span>}
            </dd>
          </div>
        )}

        {/* Author */}
        <div>
          <dt className="text-sm font-medium text-gray-700">Author</dt>
          <dd className="mt-1 text-sm text-gray-600">{node.data?.config.templateConfig.author}</dd>
        </div>

        {/* Description (optional) */}
        {node.data?.config.templateConfig.description && (
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-gray-700">Description</dt>
            <dd className="mt-1 text-sm text-gray-600">{node.data.config.templateConfig.description}</dd>
          </div>
        )}

        {/* Commit Hash */}
        {node.data.currentCommitHash ? (<div>
          <dt className="text-sm font-medium text-gray-700">Commit Hash</dt>
          <dd className="mt-1 flex items-center space-x-2 text-sm text-gray-600">
            <span className="truncate">{node.data.currentCommitHash}</span>
            <CopyIcon
              className="w-4 h-4 cursor-pointer"
              onClick={() => handleCopy(node.data!.currentCommitHash!, "currentCommitHash")}
            />
            {copiedField === "currentCommitHash" && <span className="text-xs text-green-500">Copied</span>}
          </dd>
        </div>) : null}
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
          <pre className="bg-gray-50 p-4 rounded text-sm overflow-auto">{JSON.stringify(node.data, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

/* =============================================================================
   TemplatePage
   ============================================================================= */
const TemplatePage: React.FC = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const templateName = useMemo(() => searchParams.get("templateName"), [searchParams])
  const [allTemplates, setAllTemplates] = useState<TemplateDTO[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDTO>()
  const [selectedNode, setSelectedNode] = useState<TemplateTreeNode | null>(null)

  useEffect(() => {
    if (!templateName) {
      toastNullError({
        shortMessage: "No template name provided in search params.",
      })
      router.push("/templates")
      return
    }
    retrieveAllTemplateRevisions(templateName).then((data: Result<TemplateDTO[] | null>) => {
      const toastResult = toastNullError({
        result: data,
        shortMessage: "Error retrieving template revisions",
        nullErrorMessage: "No template revisions found.",
        nullRedirectPath: "/templates",
        router,
      })
      if (!toastResult) {
        return
      }
      setAllTemplates(toastResult)
      const defaultTemplate = toastResult.find((t) => t.isDefault)
      if (!defaultTemplate) {
        toastNullError({
          shortMessage: "No default template found.",
        })
        router.push("/templates")
        return
      }
      setSelectedTemplate(defaultTemplate)
    })
  }, [templateName, router])

  const treeNodes = useMemo(() => (selectedTemplate ? [buildTemplateNode(selectedTemplate)] : []), [selectedTemplate])
  const handleSelect = useCallback((node: TemplateTreeNode) => setSelectedNode(node), [])

  const handleRevisionChange = useCallback(
    (commitHash: string) => {
      const template = allTemplates.find((t) => t.currentCommitHash === commitHash)
      if (template) {
        setSelectedTemplate(template)
        setSelectedNode(null) // Reset selected node when changing revision
      }
    },
    [allTemplates],
  )

  if (!selectedTemplate) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-lg">Loading templates...</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen">
      {/* Left side: Tree view */}
      <div className="w-1/3 border-r border-gray-300 overflow-auto">
        <header className="p-4 border-b border-gray-300 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Templates Tree</h1>
            {allTemplates.length > 1 && (
              <div className="w-64">
                <Select value={selectedTemplate?.currentCommitHash} onValueChange={handleRevisionChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select revision" />
                  </SelectTrigger>
                  <SelectContent>
                    {allTemplates.map((template) => (
                      <SelectItem key={template.currentCommitHash} value={template.currentCommitHash!}>
                        {template.isDefault ? "Default - " : ""}
                        {template.currentCommitHash!.substring(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
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
        {selectedNode ? (
          <DetailsPanel node={selectedNode} />
        ) : (
          <div className="p-6">
            <h2 className="text-2xl font-bold">Select a template from the tree</h2>
          </div>
        )}
      </div>
    </div>
  )
}

export default TemplatePage

