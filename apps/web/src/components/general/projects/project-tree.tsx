"use client"

import type React from "react"
import { useCallback } from "react"
import { Tree } from "@/components/general/Tree"
import type { ProjectTreeNode } from "./types"

interface ProjectTreeProps {
  projectTree: ProjectTreeNode[]
  selectedNode: ProjectTreeNode | null
  onSelectNode: (node: ProjectTreeNode) => void
}

export function ProjectTree({ projectTree, selectedNode, onSelectNode }: ProjectTreeProps) {
  /* Custom tree label renderer */
  const renderNodeLabel = useCallback(
    (
      node: ProjectTreeNode,
      isSelected: boolean,
      toggle: () => void,
      isOpen: boolean,
      hasChildren: boolean,
      style: React.CSSProperties,
      onClick: () => void,
    ) => {
      if (node.type === "instantiated") {
        return (
          <div
            style={style}
            className={`flex items-center p-2 cursor-pointer hover:bg-blue-100 select-none ${isSelected ? "bg-blue-200" : ""
              }`}
            onClick={onClick}
          >
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggle()
                }}
                className="mr-2 focus:outline-none"
              >
                {isOpen ? "▼" : "▶"}
              </button>
            )}
            <span className="flex-1">{node.name}</span>
          </div>
        )
      } else if (node.type === "subCategory") {
        return (
          <div
            style={style}
            className="flex items-center p-2 pl-6 cursor-pointer hover:bg-blue-50 select-none text-sm font-medium text-gray-600"
            onClick={onClick}
          >
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggle()
                }}
                className="mr-2 focus:outline-none"
              >
                {isOpen ? "▼" : "▶"}
              </button>
            )}
            <span className="flex-1">{node.name}</span>
          </div>
        )
      } else if (node.type === "childTemplate") {
        return (
          <div
            style={style}
            className="flex items-center p-2 pl-8 cursor-pointer hover:bg-blue-50 select-none text-sm text-indigo-600"
            onClick={onClick}
          >
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggle()
                }}
                className="mr-2 focus:outline-none"
              >
                {isOpen ? "▼" : "▶"}
              </button>
            )}
            <span className="flex-1">{node.templateDefinition.config.templateConfig.name}</span>
          </div>
        )
      } else if (node.type === "createInstance") {
        return (
          <div
            style={style}
            className="flex items-center p-2 pl-10 cursor-pointer hover:bg-blue-100 select-none text-green-600"
            onClick={(e) => {
              e.stopPropagation()
              onSelectNode(node)
            }}
          >
            <span className="flex-1">+ Create new instance</span>
          </div>
        )
      }
      return null
    },
    [onSelectNode],
  )

  return (
    <Tree<ProjectTreeNode>
      data={projectTree}
      onSelect={onSelectNode}
      selectedId={selectedNode?.id}
      renderLabel={renderNodeLabel}
      openByDefault={false}
      rowHeight={40}
      width="100%"
    />
  )
}

