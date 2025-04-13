"use client";

import {
  retrieveProject,
  retrieveTemplate,
  instantiateTemplate,
  reloadProjects,
} from "@/app/actions";
import { Tree } from "@/components/general/Tree";
import { Button } from "@/components/ui/button";
import type {
  InstantiatedTemplate,
  ProjectDTO,
  TemplateDTO,
} from "@repo/ts/utils/types";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";

/* =============================================================================
   Tree Node Types

   Four kinds of nodes:
    • instantiated – an already created template instance.
    • subCategory – groups a given sub template category.
    • childTemplate – represents a candidate child template (from the parent’s subTemplates).
    • createInstance – an action node to instantiate a new instance of that child template.
------------------------------------------------------------------------------- */
export type ProjectTreeNode =
  | InstantiatedNode
  | SubCategoryNode
  | ChildTemplateNode
  | CreateInstanceNode;

export interface InstantiatedNode {
  type: "instantiated";
  id: string;
  name: string;
  instanceData: {
    templateSettings: UserTemplateSettings;
  };
  children?: ProjectTreeNode[];
}

export interface SubCategoryNode {
  type: "subCategory";
  id: string;
  name: string; // category name (e.g. "Components", "Pages", etc.)
  children: ProjectTreeNode[];
}

export interface ChildTemplateNode {
  type: "childTemplate";
  id: string;
  templateDefinition: TemplateDTO;
  children: ProjectTreeNode[];
}

export interface CreateInstanceNode {
  type: "createInstance";
  id: string;
  parentId: string;
  candidateTemplate: TemplateDTO;
}

/* =============================================================================
   Helper: collectTemplates()

   Recursively traverse a TemplateDTO tree to build a mapping from template name
   to the corresponding TemplateDTO definition.
------------------------------------------------------------------------------- */
const collectTemplates = (tpl: TemplateDTO): Record<string, TemplateDTO> => {
  let map: Record<string, TemplateDTO> = {};
  map[tpl.config.templateConfig.name] = tpl;
  if (tpl.subTemplates) {
    Object.keys(tpl.subTemplates).forEach((cat) => {
      tpl.subTemplates[cat]?.forEach((sub) => {
        const subMap = collectTemplates(sub);
        map = { ...map, ...subMap };
      });
    });
  }
  return map;
};

/* =============================================================================
   Helper: buildProjectTree()

   Given the flat list of instantiated template instances (from the project settings)
   and a mapping of template definitions (from the root template), build a tree
   with the following structure:

   Instantiated Node (parent)
    └─ Sub Category Node (for each category in parent's subTemplates)
         └─ For each candidate child template in that category, create:
              └─ Child Template Node (displays the candidate definition)
                   ├─ Already instantiated child instances (recursively built)
                   └─ Create Instance Node (action to create a new instance for that candidate)
------------------------------------------------------------------------------- */
const buildProjectTree = (
  instances: InstantiatedTemplate[],
  templateMap: Record<string, TemplateDTO>,
): ProjectTreeNode[] => {
  // Group instantiated templates by parentId.
  const childrenByParent: Record<string, InstantiatedTemplate[]> = {};
  const rootInstances: InstantiatedTemplate[] = [];

  instances.forEach((inst) => {
    if (inst.parentId) {
      if (!childrenByParent[inst.parentId]) {
        childrenByParent[inst.parentId] = [];
      }
      childrenByParent[inst.parentId]!.push(inst);
    } else {
      rootInstances.push(inst);
    }
  });

  // Recursively build an instantiated node.
  const buildNode = (inst: InstantiatedTemplate): InstantiatedNode => {
    const node: InstantiatedNode = {
      type: "instantiated",
      id: inst.id,
      name: inst.templateName,
      instanceData: { templateSettings: inst.templateSettings },
      children: [],
    };

    const parentDef = templateMap[inst.templateName];
    if (parentDef && parentDef.subTemplates) {
      // For each category in the parent definition.
      Object.keys(parentDef.subTemplates).forEach((category) => {
        const candidateTemplates = parentDef.subTemplates[category]!;
        // For this category, build a childTemplate node for each candidate.
        const childTemplateNodes: ChildTemplateNode[] = candidateTemplates.map(
          (candidate) => {
            const candidateId = candidate.config.templateConfig.name;
            // Find already instantiated children whose templateName matches the candidate.
            const childInstances = (childrenByParent[inst.id] || []).filter(
              (child) => child.templateName === candidateId,
            );
            const childInstantiatedNodes = childInstances.map((child) =>
              buildNode(child),
            );

            const finalChildren: ProjectTreeNode[] = [
              ...childInstantiatedNodes,
            ];
            if (
              childInstances.length == 0 ||
              candidate.config.templateConfig.multiInstance
            ) {
              // Create a createInstance action node for this candidate.
              const createNode: CreateInstanceNode = {
                type: "createInstance",
                id: `${inst.id}-${category}-${candidateId}-create`,
                parentId: inst.id,
                candidateTemplate: candidate,
              };
              finalChildren.push(createNode);
            }
            return {
              type: "childTemplate",
              id: `${inst.id}-${category}-${candidateId}`,
              templateDefinition: candidate,
              children: finalChildren,
            } as ChildTemplateNode;
          },
        );

        // Create the subCategory node with the candidate childTemplate nodes.
        const subCategoryNode: SubCategoryNode = {
          type: "subCategory",
          id: `${inst.id}-${category}`,
          name: category,
          children: childTemplateNodes,
        };
        node.children?.push(subCategoryNode);
      });
      if (node.children && node.children.length === 0) {
        node.children = undefined;
      }
    }
    return node;
  };

  return rootInstances.map(buildNode);
};

/* =============================================================================
   ProjectTemplateTreePage Component

   Loads the project and its root template definition, builds the project tree,
   and renders a two-pane layout with the tree on the left and a details panel on
   the right. When a createInstance node is selected, the details panel shows info
   about what will be created along with a TemplateSettingsDialog trigger.
------------------------------------------------------------------------------- */
const ProjectTemplateTreePage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectNameParam = useMemo(
    () => searchParams.get("projectName"),
    [searchParams],
  );
  const [project, setProject] = useState<ProjectDTO>();
  const [rootTemplate, setRootTemplate] = useState<TemplateDTO>();
  const [projectTree, setProjectTree] = useState<ProjectTreeNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<ProjectTreeNode | null>(
    null,
  );

  // Fetch project data.
  useEffect(() => {
    if (!projectNameParam) {
      console.error("No project name provided in search params.");
      router.push("/projects");
      return;
    }
    retrieveProject(projectNameParam).then((data: ProjectDTO | null) => {
      if (!data) {
        console.error("Project not found:", projectNameParam);
        router.push("/projects");
        return;
      }
      setProject(data);
    });
  }, [projectNameParam, router]);

  // Fetch the root template definition.
  useEffect(() => {
    if (project) {
      retrieveTemplate(project.rootTemplateName).then(
        (data: TemplateDTO | null) => {
          if (!data) {
            console.error("Template not found:", project.rootTemplateName);
            return;
          }
          setRootTemplate(data);
        },
      );
    }
  }, [project]);

  // Build the tree once both project and root template are available.
  useEffect(() => {
    if (project && rootTemplate) {
      const templateMap = collectTemplates(rootTemplate);
      console.log("Template map:", templateMap);
      const tree = buildProjectTree(
        project.settings.instantiatedTemplates,
        templateMap,
      );
      setProjectTree(tree);
    }
  }, [project, rootTemplate]);

  // When a node is selected in the tree.
  const handleSelect = useCallback((node: ProjectTreeNode) => {
    setSelectedNode(node);
  }, []);

  /* ----------------------------------------------------------------------------
     Custom tree label renderer

     Renders a label for each node based on its type.
       • instantiated: shows the template instance name.
       • subCategory: shows the category name (indented).
       • childTemplate: shows the candidate template definition (further indented).
       • createInstance: renders a clickable action to create a new instance.
  ---------------------------------------------------------------------------- */
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
                  e.stopPropagation();
                  toggle();
                }}
                className="mr-2 focus:outline-none"
              >
                {isOpen ? "▼" : "▶"}
              </button>
            )}
            <span className="flex-1">{node.name}</span>
          </div>
        );
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
                  e.stopPropagation();
                  toggle();
                }}
                className="mr-2 focus:outline-none"
              >
                {isOpen ? "▼" : "▶"}
              </button>
            )}
            <span className="flex-1">{node.name}</span>
          </div>
        );
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
                  e.stopPropagation();
                  toggle();
                }}
                className="mr-2 focus:outline-none"
              >
                {isOpen ? "▼" : "▶"}
              </button>
            )}
            <span className="flex-1">
              {node.templateDefinition.config.templateConfig.name}
            </span>
          </div>
        );
      } else if (node.type === "createInstance") {
        return (
          <div
            style={style}
            className="flex items-center p-2 pl-10 cursor-pointer hover:bg-blue-100 select-none text-green-600"
            onClick={(e) => {
              e.stopPropagation();
              // Selecting the createInstance node causes its details to show.
              setSelectedNode(node);
            }}
          >
            <span className="flex-1">+ Create new instance</span>
          </div>
        );
      }
      return null;
    },
    [],
  );

  /* ----------------------------------------------------------------------------
     Details Panel

     Renders details based on the selected node:
       • instantiated: show instance data.
       • subCategory or childTemplate: display basic info.
       • createInstance: display creation info and show a TemplateSettingsDialog
         trigger (its child button acts as the trigger for opening the dialog).
  ---------------------------------------------------------------------------- */
  const renderDetailsPanel = () => {
    if (!selectedNode) {
      return (
        <div>
          <h2 className="text-2xl font-bold">Select a node from the tree</h2>
        </div>
      );
    }
    if (selectedNode.type === "instantiated") {
      return (
        <div>
          <h2 className="text-2xl font-bold mb-4">{selectedNode.name}</h2>
          <pre className="bg-gray-100 p-4 rounded text-sm">
            {JSON.stringify(selectedNode.instanceData, null, 2)}
          </pre>
        </div>
      );
    }
    if (selectedNode.type === "subCategory") {
      return (
        <div>
          <h2 className="text-2xl font-bold mb-4">
            Sub Template Category: {selectedNode.name}
          </h2>
          <pre className="bg-gray-100 p-4 rounded text-sm">
            {JSON.stringify(selectedNode, null, 2)}
          </pre>
        </div>
      );
    }
    if (selectedNode.type === "childTemplate") {
      return (
        <div>
          <h2 className="text-2xl font-bold mb-4">
            Child Template:{" "}
            {selectedNode.templateDefinition.config.templateConfig.name}
          </h2>
          <pre className="bg-gray-100 p-4 rounded text-sm">
            {JSON.stringify(selectedNode.templateDefinition, null, 2)}
          </pre>
        </div>
      );
    }
    if (selectedNode.type === "createInstance") {
      const candidate = selectedNode.candidateTemplate;
      return (
        <div>
          <h2 className="text-2xl font-bold mb-4">Create New Instance</h2>
          <p className="mb-4 text-sm">
            This will create a new{" "}
            <span className="font-medium">
              {candidate.config.templateConfig.name}
            </span>{" "}
            instance under the parent with ID{" "}
            <span className="font-medium">{selectedNode.parentId}</span>.
          </p>
          <Button
            disabled={!projectNameParam || !project}
            onClick={() => {
              router.push(
                `/projects/instantiate-template/?projectName=${projectNameParam}&rootTemplate=${project?.rootTemplateName}&template=${candidate.config.templateConfig.name}&parentTemplateInstanceId=${selectedNode.parentId}`,
              );
            }}
          >
            Create
          </Button>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex h-screen">
      {/* Left: Tree view */}
      <div className="w-1/3 border-r border-gray-300 overflow-auto">
        <header className="p-4 border-b border-gray-300">
          <h1 className="text-3xl font-bold">Project Templates Tree</h1>
        </header>
        <div className="p-4">
          <Tree<ProjectTreeNode>
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
      {/* Right: Details panel */}
      <div className="w-2/3 overflow-auto p-6">{renderDetailsPanel()}</div>
    </div>
  );
};

export default ProjectTemplateTreePage;
