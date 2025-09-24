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
import { getRootTemplateRepository } from "../../repositories";
import { deepSortObject } from "../../utils/shared-utils";
import { makeDir } from "../../services/file-service";

interface LoadedProjectSettingsResult {
  settings: ProjectSettings;
  rootTemplate: Template;
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

    const dirResult = await makeDir(this.projectPath);

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
      const repo = await getRootTemplateRepository();
      const addResult = await repo.addRemoteRepo(
        rootInstantiated.templateRepoUrl,
        rootInstantiated.templateBranch ?? "main",
      );
      if ("error" in addResult) {
        return addResult;
      }
    }

    const repo = await getRootTemplateRepository();
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
    }

    for (const subTemplateSettings of validated.data.instantiatedTemplates) {
      const subTemplate = rootTemplate.data.findSubTemplate(
        subTemplateSettings.templateName,
      );
      if (!subTemplate) {
        logError({
          shortMessage: `Sub template ${subTemplateSettings.templateName} not found in root template ${validated.data.rootTemplateName}`,
        });
        return {
          error: `Template ${subTemplateSettings.templateName} not found in root template ${validated.data.rootTemplateName}`,
        };
      }

      const subTemplateSettingsSchema =
        subTemplate.config.templateSettingsSchema.safeParse(
          subTemplateSettings.templateSettings,
        );
      if (!subTemplateSettingsSchema.success) {
        logError({
          shortMessage: `Invalid templateSettings.json for template ${subTemplateSettings.templateName}: ${subTemplateSettingsSchema.error}`,
        });
        return {
          error: `Invalid templateSettings.json for template ${subTemplateSettings.templateName}: ${subTemplateSettingsSchema.error}`,
        };
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
