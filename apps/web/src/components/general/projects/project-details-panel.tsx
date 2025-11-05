"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { ProjectTreeNode } from "./types";
import {
  ProjectDTO,
  TemplateDTO,
  findTemplate
} from "@timonteutelink/skaff-lib/browser";
import { useCallback, useMemo } from "react";
import { toastNullError } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import { runProjectCommand } from "@/app/actions/project";

interface ProjectDetailsPanelProps {
  selectedNode: ProjectTreeNode | null;
  project: ProjectDTO;
  rootTemplate: TemplateDTO;
  latestTemplate: TemplateDTO;
}

export function ProjectDetailsPanel({
  selectedNode,
  project,
  rootTemplate,
  latestTemplate,
}: ProjectDetailsPanelProps) {
  const router = useRouter();
  const selectedNodeTemplate = useMemo(
    () =>
      selectedNode?.type === "instantiated"
        ? toastNullError({
          result: findTemplate(rootTemplate, selectedNode.name),
          shortMessage: "An error occurred trying to find the template.",
          nullErrorMessage: "No template was found",
        }) || null
        : null,
    [selectedNode, rootTemplate],
  );

  const selectedInstantiatedTemplate = useMemo(
    () =>
      project.settings.instantiatedTemplates.find(
        (inst) => inst.id === selectedNode?.id,
      ),
    [project, selectedNode],
  );

  const handleExecuteCommand = useCallback(
    async (command: { title: string; description: string }) => {
      if (!selectedNode) {
        toastNullError({
          shortMessage: "No selected node",
        });
        return;
      }
      //TODO first show popup with command to run then actually run it.
      const result = await runProjectCommand(
        project.name,
        selectedNode.id,
        command.title,
      );
      const commandOutput = toastNullError({
        result,
        shortMessage: "Error executing command",
      });
      if (commandOutput) {
        console.log("Command output:", commandOutput);
        alert(`Command executed successfully: ${commandOutput}`);
      }
    },
    [project, selectedNode],
  );

  if (!selectedNode) {
    return (
      <div>
        <h2 className="text-2xl font-bold">Select a node from the tree</h2>
      </div>
    );
  }

  if (selectedNode.type === "instantiated" && selectedInstantiatedTemplate) {
    const { id, templateName, parentId, templateSettings, templateCommitHash } =
      selectedInstantiatedTemplate;

    return (
      <div className="space-y-6">
        {/* Header with title and edit button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <h2 className="text-2xl font-bold">
              {selectedNodeTemplate?.config.templateConfig.name} Instance
            </h2>
            {templateCommitHash ? (
              latestTemplate.currentCommitHash === templateCommitHash ? (
                <Badge className="ml-4 bg-green-100 text-green-800">
                  Up-to-date
                </Badge>
              ) : (
                <Badge className="ml-4 bg-red-100 text-red-800">Outdated</Badge>
              )
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {!selectedInstantiatedTemplate.automaticallyInstantiatedByParent ? (
              <Button
                disabled={!project?.name}
                onClick={() => {
                  router.push(
                    `/projects/instantiate-template/?projectRepositoryName=${project.name}` +
                    `&existingTemplateInstanceId=${id}` +
                    `&template=${selectedInstantiatedTemplate.templateName}`,
                  );
                }}
              >
                Edit
              </Button>
            ) : null}
            {selectedNodeTemplate?.templateCommands?.length ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Open actions menu"
                    className="rounded-full"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end">
                  {selectedNodeTemplate.templateCommands.map((item) => (
                    <DropdownMenuItem
                      key={item.title}
                      onClick={() => handleExecuteCommand(item)}
                      className="cursor-pointer"
                    >
                      {item.title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* General Info */}
          <div>
            <h3 className="text-lg font-semibold mb-2">General</h3>
            <dl className="space-y-2">
              <div>
                <dt className="text-sm font-medium text-gray-700">
                  Instance ID
                </dt>
                <dd className="text-sm text-gray-600 truncate">{id}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-700">
                  Template Name
                </dt>
                <dd className="text-sm text-gray-600">{templateName}</dd>
              </div>
              {parentId && (
                <div>
                  <dt className="text-sm font-medium text-gray-700">
                    Parent Instance ID
                  </dt>
                  <dd className="text-sm text-gray-600 truncate">{parentId}</dd>
                </div>
              )}
              <div>
                <dt className="text-sm font-medium text-gray-700">
                  Commit Hash
                </dt>
                <dd className="text-sm text-gray-600 truncate">
                  {templateCommitHash}
                </dd>
              </div>
            </dl>
          </div>

          {/* Settings Info */}
          <div>
            <h3 className="text-lg font-semibold mb-2">Settings</h3>
            {Object.keys(templateSettings).length > 0 ? (
              <dl className="space-y-2">
                {Object.entries(templateSettings).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-sm font-medium text-gray-700 capitalize">
                      {key}
                    </dt>
                    <dd className="text-sm text-gray-600">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-gray-500">No settings available.</p>
            )}
          </div>
        </div>

        {/* Template Description, if provided */}
        {selectedNodeTemplate?.config.templateConfig.description && (
          <div>
            <h3 className="text-lg font-semibold mb-2">Template Description</h3>
            <p className="text-sm text-gray-600">
              {selectedNodeTemplate.config.templateConfig.description}
            </p>
          </div>
        )}

        {/* Raw JSON as fallback */}
        <div>
          <h3 className="text-lg font-semibold mb-2">Raw Data</h3>
          <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
            {JSON.stringify(selectedInstantiatedTemplate, null, 2)}
          </pre>
        </div>
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
          disabled={!project || !project.name}
          onClick={() => {
            router.push(
              `/projects/instantiate-template/?projectRepositoryName=${project.name}` +
              `&template=${candidate.config.templateConfig.name}` +
              `&parentTemplateInstanceId=${selectedNode.parentId}`,
            );
          }}
        >
          Create
        </Button>
      </div>
    );
  }

  return null;
}
