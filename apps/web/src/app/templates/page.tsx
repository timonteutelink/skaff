'use client';

import type { TemplateDTO } from '@repo/ts/utils/types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Tree } from 'react-arborist';
import { retrieveTemplates } from '../actions';

export interface TemplateTreeNode {
  id: string;
  name: string;
  type: 'template' | 'category';
  data?: TemplateDTO;
  children?: TemplateTreeNode[];
}

// Recursively build a tree node from a TemplateDTO,
// adding category container nodes for each key in subTemplates.
const buildTemplateNode = (template: TemplateDTO): TemplateTreeNode => {
  const categoryNodes: TemplateTreeNode[] = Object.entries(template.subTemplates).map(
    ([category, templates]) => {
      const childNodes: TemplateTreeNode[] = templates.map((tmpl) => buildTemplateNode(tmpl));
      return {
        id: `${template.dir}-${category}`,
        name: category,
        type: 'category',
        children: childNodes,
      };
    }
  );

  return {
    id: template.dir,
    name: template.config.templateConfig.name,
    type: 'template',
    data: template,
    children: categoryNodes.length > 0 ? categoryNodes : undefined,
  };
};

const buildTreeNodes = (templates: TemplateDTO[]): TemplateTreeNode[] => {
  return templates.map((template) => buildTemplateNode(template));
};

interface DetailsPanelProps {
  node: TemplateTreeNode;
}

const DetailsPanel: React.FC<DetailsPanelProps> = ({ node }) => {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">{node.name}</h2>
      <div className="space-y-3">
        <div>
          <span className="font-semibold">Type: </span>
          <span>{node.type}</span>
        </div>
        {node.data && (
          <>
            <div>
              <span className="font-semibold">Directory: </span>
              <span>{node.data.dir}</span>
            </div>
            <div>
              <span className="font-semibold">Templates Directory: </span>
              <span>{node.data.templatesDir}</span>
            </div>
            {node.data.refDir && (
              <div>
                <span className="font-semibold">Reference Directory: </span>
                <span>{node.data.refDir}</span>
              </div>
            )}
            <div>
              <span className="font-semibold">Author: </span>
              <span>{node.data.config.templateConfig.author}</span>
            </div>
            {node.data.config.templateConfig.description && (
              <div>
                <span className="font-semibold">Description: </span>
                <span>{node.data.config.templateConfig.description}</span>
              </div>
            )}
            <div>
              <span className="font-semibold">Settings Schema: </span>
              <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto">
                {JSON.stringify(node.data.config.templateSettingsSchema, null, 2)}
              </pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
const TemplateArboristTreePage: React.FC = () => {
  const [templates, setTemplates] = useState<TemplateDTO[]>([]);
  const [selectedNode, setSelectedNode] = useState<TemplateTreeNode | null>(null);

  useEffect(() => {
    retrieveTemplates().then((data: TemplateDTO[]) => {
      console.log('Templates data:', data);
      setTemplates(data);
    });
  }, []);

  const treeNodes: TemplateTreeNode[] = useMemo(() => buildTreeNodes(templates), [templates]);

  const handleSelect = useCallback((node: TemplateTreeNode) => {
    setSelectedNode(node);
  }, []);

  return (
    <div className="flex h-screen">
      {/* Left side: Tree view */}
      <div className="w-1/2 border-r border-gray-300 overflow-auto">
        <header className="p-4 border-b border-gray-300">
          <h1 className="text-3xl font-bold">Templates Tree</h1>
        </header>
        <div className="p-4">
          <Tree<TemplateTreeNode>
            data={treeNodes}
            rowHeight={40}
          >
            {(props) => (
              <div
                style={props.style}
                className={`p-2 cursor-pointer hover:bg-blue-100 select-none ${selectedNode?.id === props.node.data.id ? 'bg-blue-200' : ''}`}
                onClick={() => handleSelect(props.node.data)}
              >
                {props.node.data.name}
              </div>
            )}
          </Tree>
        </div>
      </div>
      {/* Right side: Details panel */}
      <div className="w-1/2 overflow-auto">
        {selectedNode ? (
          <DetailsPanel node={selectedNode} />
        ) : (
          <div className="p-6">
            <h2 className="text-2xl font-bold">Select a template from the tree</h2>
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateArboristTreePage;

