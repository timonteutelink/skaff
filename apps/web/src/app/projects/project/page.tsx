'use client';

import { retrieveProject, retrieveTemplate } from '@/app/actions';
import { TemplateSettingsDialog } from '@/components/general/TemplateSettingsDialog';
import { Tree } from '@/components/general/Tree';
import { Button } from '@/components/ui/button';
import type { InstantiatedTemplate, ProjectDTO, TemplateDTO } from '@repo/ts/utils/types';
import { UserTemplateSettings } from '@timonteutelink/template-types-lib';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

export interface ProjectTemplateTreeNode {
  id: string;
  name: string;
  instanceData: {
    templateSettings: UserTemplateSettings;
  };
  children?: ProjectTemplateTreeNode[];
}

const buildProjectTemplateTree = (
  instances: InstantiatedTemplate[]
): ProjectTemplateTreeNode[] => {
  const nodeMap: { [id: string]: ProjectTemplateTreeNode } = {};
  const tree: ProjectTemplateTreeNode[] = [];

  // Create a map entry for each instance.
  instances.forEach((inst) => {
    nodeMap[inst.id] = {
      id: inst.id,
      name: inst.templateName,
      instanceData: { templateSettings: inst.templateSettings },
      children: [],
    };
  });

  // Build parent–child relationships.
  instances.forEach((inst) => {
    if (inst.parentId) {
      const parentNode = nodeMap[inst.parentId];
      if (parentNode) {
        parentNode.children!.push(nodeMap[inst.id]!);
      } else {
        // If parentId not found, treat as root.
        tree.push(nodeMap[inst.id]!);
      }
    } else {
      tree.push(nodeMap[inst.id]!);
    }
  });

  return tree;
};

const ProjectTemplateTreePage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectNameParam = useMemo(() => searchParams.get('projectName'), [searchParams]);
  const [project, setProject] = useState<ProjectDTO>();
  const [rootTemplate, setRootTemplate] = useState<TemplateDTO>();
  const [selectedNode, setSelectedNode] = useState<ProjectTemplateTreeNode | null>(null);
  const [projectTree, setProjectTree] = useState<ProjectTemplateTreeNode[]>([]);

  useEffect(() => {
    if (!projectNameParam) {
      console.error('No project name provided in search params.');
      router.push('/projects');
      return;
    }

    retrieveProject(projectNameParam).then((data: ProjectDTO | null) => {
      if (!data) {
        console.error('Project not found:', projectNameParam);
        router.push('/projects');
        return;
      }
      setProject(data);
      // Build the tree from the flat list of instantiatedTemplates.
      const tree = buildProjectTemplateTree(data.settings.instantiatedTemplates);
      setProjectTree(tree);
    });
  }, [projectNameParam, router]);

  useEffect(() => {
    if (project) {
      retrieveTemplate(project.rootTemplateName).then((data) => {
        if (!data) {
          console.error('Template not found:', project.rootTemplateName);
          return;
        }
        setRootTemplate(data);
      });
    }
  }, [project]);

  const handleSelect = useCallback((node: ProjectTemplateTreeNode) => {
    setSelectedNode(node);
  }, []);

  // This function is called when the "Create" button is clicked.
  // You can extend it to open a modal, or navigate to another page.
  const handleCreateTemplateInstance = useCallback((userSettings: UserTemplateSettings, parentId: string) => {
    console.log(
      'Creating template instance with settings:',
      { userSettings, parentId }
    );

  }, []);

  const renderTemplateSettingsDialog = useCallback((parentNode: ProjectTemplateTreeNode) => {
    const templateToInit = //TODO;
    if (!templateToInit) {
      return null;
    }
    const selectedTemplateSettingsSchema = templateToInit.config.templateSettingsSchema;
    const projectName = projectNameParam;
    if (!selectedTemplateSettingsSchema || !projectName) {
      return null;
    }
    return (<TemplateSettingsDialog
      projectName={projectNameParam}
      selectedTemplate={templateToInit.config.templateConfig.name}
      selectedTemplateSettingsSchema={selectedTemplateSettingsSchema}

      action={async (userSettings) => handleCreateTemplateInstance(userSettings, parentNode.id)}
      cancel={() => {
      }}
    >
      <Button disabled={!projectNameParam}>
        Create
      </Button>
    </TemplateSettingsDialog>)
  }, [projectNameParam]);

  // Custom label renderer: shows the template name and a "Create" button.
  const renderNodeLabel = useCallback(
    (
      node: ProjectTemplateTreeNode,
      isSelected: boolean,
      toggle: () => void,
      isOpen: boolean,
      hasChildren: boolean,
      style: React.CSSProperties,
      onClick: () => void
    ) => (
      <div
        style={style}
        className={`flex items-center p-2 cursor-pointer hover:bg-blue-100 select-none ${isSelected ? 'bg-blue-200' : ''
          } break-words`}
        onClick={onClick}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            className="mr-2 focus:outline-none"
          >
            {isOpen ? '▼' : '▶'}
          </button>
        )}
        <span className="flex-1">{node.name}</span>
        {renderTemplateSettingsDialog(node)}
      </div>
    ),
    [renderTemplateSettingsDialog]
  );

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-lg">Loading project...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Left side: Tree view */}
      <div className="w-1/3 border-r border-gray-300 overflow-auto">
        <header className="p-4 border-b border-gray-300">
          <h1 className="text-3xl font-bold">Project Templates Tree</h1>
        </header>
        <div className="p-4">
          <Tree<ProjectTemplateTreeNode>
            data={projectTree}
            onSelect={handleSelect}
            selectedId={selectedNode?.id}
            renderLabel={renderNodeLabel}
            openByDefault={false}
            rowHeight={40}
            width="100%"
          />
        </div>
      </div>
      {/* Right side: Details panel */}
      <div className="w-2/3 overflow-auto p-6">
        {selectedNode ? (
          <div>
            <h2 className="text-2xl font-bold mb-4">{selectedNode.name}</h2>
            <pre className="bg-gray-100 p-4 rounded text-sm">
              {JSON.stringify(selectedNode.instanceData, null, 2)}
            </pre>
          </div>
        ) : (
          <div>
            <h2 className="text-2xl font-bold">Select a template instance from the tree</h2>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectTemplateTreePage;
