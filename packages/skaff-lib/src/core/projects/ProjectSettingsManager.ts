import * as fs from "node:fs/promises";
import path from "node:path";

import {
  InstantiatedTemplate,
  ProjectSettings,
  projectSettingsSchema,
} from "@timonteutelink/template-types-lib";

import { Result } from "../../lib/types";
import { logError } from "../../lib/utils";
import { Template } from "../../models/template";
import { resolveRootTemplateRepository } from "../../repositories";
import { deepSortObject } from "../../utils/shared-utils";
import { resolveFileSystemService } from "../infra/file-service";

interface LoadedProjectSettingsResult {
  settings: ProjectSettings;
  rootTemplate: Template;
}

function getFileSystemService() {
  return resolveFileSystemService();
}

export class ProjectSettingsManager {
  constructor(private readonly projectPath: string) {}

  private get settingsFilePath(): string {
    return path.join(this.projectPath, "templateSettings.json");
  }

  public async writeInitialSettings(
    projectSettings: ProjectSettings,
    overwrite = false,
  ): Promise<Result<void>> {
    if (!projectSettings.instantiatedTemplates[0]) {
      logError({
        shortMessage: "No instantiated templates found in project settings",
      });
      return {
        error: "No instantiated templates found in project settings",
      };
    }

    const initialSettings: ProjectSettings = {
      ...projectSettings,
      instantiatedTemplates: [projectSettings.instantiatedTemplates[0]!],
    };

    return this.writeSettings(initialSettings, overwrite);
  }

  public async writeSettings(
    projectSettings: ProjectSettings,
    overwrite = false,
  ): Promise<Result<void>> {
    const projectSettingsPath = this.settingsFilePath;

    if (!overwrite) {
      try {
        await fs.access(projectSettingsPath);
        logError({
          shortMessage: `Project settings file already exists at ${projectSettingsPath}`,
        });
        return {
          error: `Project settings file already exists at ${projectSettingsPath}`,
        };
      } catch {
        // File does not exist, continue
      }
    }

    const dirResult = await getFileSystemService().makeDir(this.projectPath);

    if ("error" in dirResult) {
      return dirResult;
    }

    const canonical = deepSortObject(projectSettings);
    const serialized = JSON.stringify(canonical, null, 2) + "\n";

    try {
      await fs.writeFile(projectSettingsPath, serialized, "utf-8");
    } catch (error) {
      logError({
        shortMessage: "Failed to write templateSettings.json",
        error,
      });
      return { error: `Failed to write templateSettings.json: ${error}` };
    }

    return { data: undefined };
  }

  public async appendTemplate(
    instantiatedTemplate: InstantiatedTemplate,
  ): Promise<Result<void>> {
    const projectSettingsResult = await this.load();

    if ("error" in projectSettingsResult) {
      return projectSettingsResult;
    }

    const projectSettings = projectSettingsResult.data.settings;
    projectSettings.instantiatedTemplates.push(instantiatedTemplate);

    return this.writeSettings(projectSettings, true);
  }

  public async removeTemplate(templateInstanceId: string): Promise<Result<void>> {
    const projectSettingsResult = await this.load();

    if ("error" in projectSettingsResult) {
      return projectSettingsResult;
    }

    const projectSettings = projectSettingsResult.data.settings;
    const filtered = projectSettings.instantiatedTemplates.filter(
      (template) => template.id !== templateInstanceId,
    );

    if (filtered.length === projectSettings.instantiatedTemplates.length) {
      return { data: undefined };
    }

    projectSettings.instantiatedTemplates = filtered;
    return this.writeSettings(projectSettings, true);
  }

  public async load(): Promise<Result<LoadedProjectSettingsResult>> {
    let parsed: ProjectSettings;
    try {
      const projectSettings = await fs.readFile(this.settingsFilePath, "utf-8");
      parsed = JSON.parse(projectSettings);
    } catch (error) {
      logError({
        shortMessage: "Failed to read templateSettings.json",
        error,
      });
      return {
        error: `Failed to read templateSettings.json: ${error}`,
      };
    }

    const validated = projectSettingsSchema.safeParse(parsed);
    if (!validated.success) {
      logError({
        shortMessage: `Invalid templateSettings.json: ${validated.error}`,
      });
      return {
        error: `Invalid templateSettings.json: ${validated.error}`,
      };
    }

    const rootInstantiated = validated.data.instantiatedTemplates[0];
    const commitHash = rootInstantiated?.templateCommitHash;

    if (!commitHash) {
      logError({
        shortMessage: `No instantiated root template commit hash found in project settings`,
      });
      return {
        error: `No instantiated root template commit hash found in project settings`,
      };
    }

    if (rootInstantiated?.templateRepoUrl) {
      const repo = resolveRootTemplateRepository();
      const addResult = await repo.addRemoteRepo(
        rootInstantiated.templateRepoUrl,
        rootInstantiated.templateBranch ?? "main",
      );
      if ("error" in addResult) {
        return addResult;
      }
    }

    const repo = resolveRootTemplateRepository();
    const remoteReposToLoad = new Map<string, { url: string; branch: string }>();

    for (const instantiated of validated.data.instantiatedTemplates) {
      if (!instantiated.templateRepoUrl) {
        continue;
      }
      const branch = instantiated.templateBranch ?? "main";
      const key = `${instantiated.templateRepoUrl}#${branch}`;
      if (!remoteReposToLoad.has(key)) {
        remoteReposToLoad.set(key, { url: instantiated.templateRepoUrl, branch });
      }
    }

    for (const entry of remoteReposToLoad.values()) {
      const addResult = await repo.addRemoteRepo(entry.url, entry.branch);
      if ("error" in addResult) {
        return addResult;
      }
    }

    const rootTemplate = await repo.loadRevision(
      validated.data.rootTemplateName,
      commitHash,
    );

    if ("error" in rootTemplate) {
      return rootTemplate;
    }

    if (!rootTemplate.data) {
      logError({
        shortMessage: `Root template ${validated.data.rootTemplateName} not found`,
      });
      return {
        error: `Root template ${validated.data.rootTemplateName} not found`,
      };
    }

    if (rootInstantiated) {
      if (rootTemplate.data.repoUrl) {
        rootInstantiated.templateRepoUrl = rootTemplate.data.repoUrl;
      }
      if (rootTemplate.data.branch) {
        rootInstantiated.templateBranch = rootTemplate.data.branch;
      }
      if (rootTemplate.data.commitHash) {
        rootInstantiated.templateCommitHash = rootTemplate.data.commitHash;
      }
    }

    const instantiatedById = new Map(
      validated.data.instantiatedTemplates.map((instantiated) => [
        instantiated.id,
        instantiated,
      ]),
    );

    const childrenByParent = new Map<
      string | undefined,
      ProjectSettings["instantiatedTemplates"]
    >();

    for (const instantiated of validated.data.instantiatedTemplates) {
      const parentId = instantiated.parentId;
      const list = childrenByParent.get(parentId) ?? [];
      list.push(instantiated);
      childrenByParent.set(parentId, list);
    }

    const processingQueue: (string | undefined)[] = [undefined];
    const seenParents = new Set<string | undefined>();

    while (processingQueue.length > 0) {
      const parentId = processingQueue.shift();
      if (seenParents.has(parentId)) {
        continue;
      }
      seenParents.add(parentId);

      const siblings = childrenByParent.get(parentId);
      if (!siblings) {
        continue;
      }

      let parentTemplate: Template;
      if (!parentId) {
        parentTemplate = rootTemplate.data;
      } else {
        const parentSettings = instantiatedById.get(parentId);
        if (!parentSettings) {
          return {
            error: `Parent template with id ${parentId} not found in templateSettings.json`,
          };
        }

        const maybeParentTemplate = rootTemplate.data.findSubTemplate(
          parentSettings.templateName,
        );

        if (!maybeParentTemplate) {
          logError({
            shortMessage: `Parent template ${parentSettings.templateName} not found while attaching detached templates`,
          });
          return {
            error: `Template ${parentSettings.templateName} not found while loading detached templates`,
          };
        }

        parentTemplate = maybeParentTemplate;
      }

      for (const childSettings of siblings) {
        if (!seenParents.has(childSettings.id)) {
          processingQueue.push(childSettings.id);
        }

        if (parentId === childSettings.id) {
          continue;
        }

        let childTemplate = rootTemplate.data.findSubTemplate(
          childSettings.templateName,
        );

        if (!childTemplate) {
          const commit = childSettings.templateCommitHash;
          const childResult = commit
            ? await repo.loadRevision(childSettings.templateName, commit)
            : await repo.findTemplate(childSettings.templateName);

          if ("error" in childResult) {
            return childResult;
          }

          childTemplate = childResult.data;

          if (!childTemplate) {
            logError({
              shortMessage: `Template ${childSettings.templateName} could not be loaded`,
            });
            return {
              error: `Template ${childSettings.templateName} could not be loaded`,
            };
          }

          repo.attachDetachedChild(parentTemplate, childTemplate);
        }

        const schemaParse =
          childTemplate.config.templateSettingsSchema.safeParse(
            childSettings.templateSettings,
          );

        if (!schemaParse.success) {
          logError({
            shortMessage: `Invalid templateSettings.json for template ${childSettings.templateName}: ${schemaParse.error}`,
          });
          return {
            error: `Invalid templateSettings.json for template ${childSettings.templateName}: ${schemaParse.error}`,
          };
        }

        if (childTemplate.repoUrl) {
          childSettings.templateRepoUrl = childTemplate.repoUrl;
        }
        if (childTemplate.branch) {
          childSettings.templateBranch = childTemplate.branch;
        }
        if (childTemplate.commitHash) {
          childSettings.templateCommitHash = childTemplate.commitHash;
        }
      }
    }

    return {
      data: {
        settings: validated.data,
        rootTemplate: rootTemplate.data,
      },
    };
  }
}
