'use client';

import type { TemplateDTO } from '@repo/ts/utils/types';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NodeApi, Tree } from 'react-arborist';
import { retrieveTemplate } from '@/app/actions';

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateName = useMemo(() => searchParams.get('templateName'), [searchParams]);
  const [template, setTemplate] = useState<TemplateDTO>();
  const [selectedNode, setSelectedNode] = useState<TemplateTreeNode | null>(null);

  useEffect(() => {
    if (!templateName) {
      console.error('No template name provided in search params.');
      router.push("/templates");
      return;
    }

    retrieveTemplate(templateName).then((data: TemplateDTO | null) => {
      console.log('Templates data:', data);
      if (!data) {
        console.error('Template not found:', templateName);
        router.push("/templates");
        return;
      }
      setTemplate(data);
    });
  }, [templateName, router]);

  const treeNodes: TemplateTreeNode[] = useMemo(() => template ? [buildTemplateNode(template)] : [], [template]);

  const handleSelect = useCallback((node: NodeApi<TemplateTreeNode>) => {
    setSelectedNode(node.data);
    if (node.isClosed) {
      node.toggle();
    }
  }, []);

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
          <Tree<TemplateTreeNode> openByDefault={false} data={treeNodes} rowHeight={40} width="100%">
            {(props) => {
              const hasChildren = props.node.children && props.node.children.length > 0;
              return (
                <div
                  style={props.style}
                  className={`flex items-center p-2 cursor-pointer hover:bg-blue-100 select-none ${selectedNode?.id === props.node.data.id ? 'bg-blue-200' : ''
                    } break-words`}
                  onClick={() => handleSelect(props.node)}
                >
                  {hasChildren && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        props.node.toggle();
                      }}
                      className="mr-2 focus:outline-none"
                    >
                      {props.node.isOpen ? '▼' : '▶'}
                    </button>
                  )}
                  <span className="flex-1">{props.node.data.name}</span>
                </div>
              );
            }}
          </Tree>
        </div>
      </div>
      {/* Right side: Details panel */}
      <div className="w-2/3 overflow-auto">
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

