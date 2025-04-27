"use client";

import { switchProjectBranch } from "@/app/actions/git";
import { retrieveProject } from "@/app/actions/project";
import { retrieveDefaultTemplate, retrieveTemplateRevisionForProject } from "@/app/actions/template";
import { ProjectDetailsPanel } from "@/components/general/projects/project-details-panel";
import { ProjectHeader } from "@/components/general/projects/project-header";
import { ProjectTree } from "@/components/general/projects/project-tree";
import type { ProjectTreeNode } from "@/components/general/projects/types";
import { toastNullError } from "@/lib/utils";
import type {
  InstantiatedTemplate,
  ProjectDTO,
  TemplateDTO
} from "@repo/ts/lib/types";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

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

type InstantiatedNode = {
  type: "instantiated";
  id: string;
  name: string;
  instanceData: { templateSettings: any };
  children?: ProjectTreeNode[];
};

type SubCategoryNode = {
  type: "subCategory";
  id: string;
  name: string;
  children: ProjectTreeNode[];
};

type ChildTemplateNode = {
  type: "childTemplate";
  id: string;
  templateDefinition: TemplateDTO;
  children: ProjectTreeNode[];
};

type CreateInstanceNode = {
  type: "createInstance";
  id: string;
  parentId: string;
  candidateTemplate: TemplateDTO;
};

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
export default function ProjectTemplateTreePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectNameParam = useMemo(
    () => searchParams.get("projectName"),
    [searchParams],
  );
  const [project, setProject] = useState<ProjectDTO>();
  const [rootTemplate, setRootTemplate] = useState<TemplateDTO>();// Specific revision for this project.
  const [defaultTemplate, setDefaultTemplate] = useState<TemplateDTO>();// Default revision
  const [projectTree, setProjectTree] = useState<ProjectTreeNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<ProjectTreeNode | null>(
    null,
  );

  // Fetch project data.
  useEffect(() => {
    if (!projectNameParam) {
      toastNullError({
        shortMessage: "No project name provided in search params.",
      })
      router.push("/projects");
      return;
    }

    const retrieveStuff = async () => {
      const [projectResult, revisionResult] = await Promise.all([retrieveProject(projectNameParam), retrieveTemplateRevisionForProject(projectNameParam)]);

      const project = toastNullError({
        result: projectResult,
        shortMessage: "Error retrieving project.",
        nullErrorMessage: "Project not found.",
        nullRedirectPath: "/projects",
        router,
      });
      if (!project) {
        return;
      }
      if (project.settings.instantiatedTemplates.length === 0) {
        toastNullError({
          shortMessage: "No instantiated templates found in project.",
        });
        router.push("/projects");
        return;
      }

      setProject(project);

      const revision = toastNullError({
        result: revisionResult,
        shortMessage: "Error retrieving template revision.",
        nullErrorMessage: `Template not found for project ${projectNameParam}.`,
        nullRedirectPath: "/projects",
        router,
      });

      if (!revision) {
        return;
      }

      setRootTemplate(revision);
    };
    retrieveStuff();
  }, [projectNameParam, router]);

  useEffect(() => {
    if (rootTemplate) {
      retrieveDefaultTemplate(rootTemplate.config.templateConfig.name).then((defaultTemplateResult) => {
        const defaultTemplate = toastNullError({
          result: defaultTemplateResult,
          shortMessage: "Error retrieving default template.",
          nullErrorMessage: `Default template not found for ${rootTemplate.config.templateConfig.name}.`,
        });
        if (!defaultTemplate) {
          return;
        }
        setDefaultTemplate(defaultTemplate.template);
      });
    }
  }, [rootTemplate]);

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

  const handleSelectNode = useCallback((node: ProjectTreeNode) => {
    setSelectedNode(node);
  }, []);

  const handleBranchChange = useCallback(
    async (branch: string) => {
      if (!projectNameParam) return;

      const switchResult = await switchProjectBranch(projectNameParam, branch);
      const result = toastNullError({
        result: switchResult,
        shortMessage: "Error switching branch.",
      });
      if (!result) {
        return;
      }
      const updatedProjectResult = await retrieveProject(projectNameParam);
      const updatedProject = toastNullError({
        result: updatedProjectResult,
        shortMessage: "Error retrieving updated project.",
        nullErrorMessage: `Updated project not found for ${projectNameParam}.`,
      });
      if (!updatedProject) {
        return;
      }
      setProject(updatedProject);
    },
    [projectNameParam],
  );

  if (!project || !rootTemplate || !defaultTemplate) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Loading project...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {projectNameParam && (
        <ProjectHeader project={project} onBranchChange={handleBranchChange} defaultTemplate={defaultTemplate} />
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Tree view */}
        <div className="w-1/3 border-r border-gray-300 overflow-auto">
          <div className="p-4">
            <ProjectTree
              projectTree={projectTree}
              selectedNode={selectedNode}
              onSelectNode={handleSelectNode}
            />
          </div>
        </div>

        {/* Right: Details panel */}
        <div className="w-2/3 overflow-auto p-6">
          <ProjectDetailsPanel
            selectedNode={selectedNode}
            project={project}
            rootTemplate={rootTemplate}
            defaultTemplate={defaultTemplate}
          />
        </div>
      </div>
    </div>
  );
}
