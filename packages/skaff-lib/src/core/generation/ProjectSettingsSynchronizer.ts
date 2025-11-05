import {
  FinalTemplateSettings,
  ProjectSettings,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import crypto from "node:crypto";
import { backendLogger } from "../../lib/logger";
import { Result } from "../../lib/types";
import { Project } from "../../models";
import { Template } from "../../models/template";
import {
  removeTemplateFromSettings,
  writeNewProjectSettings,
  writeNewTemplateToSettings,
} from "../projects/project-settings-service";
import { getLatestTemplateMigrationUuid } from "../templates/TemplateMigration";
import { GeneratorOptions } from "./template-generator-service";

export class ProjectSettingsSynchronizer {
  constructor(
    private readonly options: GeneratorOptions,
    private readonly destinationProjectSettings: ProjectSettings,
    private readonly rootTemplate: Template,
  ) {}

  public getProjectSettings(): ProjectSettings {
    return this.destinationProjectSettings;
  }

  public collectTemplateTreeIds(rootInstanceId: string): Set<string> {
    const idsToRemove = new Set<string>();
    const queue: string[] = [rootInstanceId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;

      if (idsToRemove.has(currentId)) {
        continue;
      }

      idsToRemove.add(currentId);

      for (const templateSetting of this.destinationProjectSettings
        .instantiatedTemplates) {
        if (templateSetting.parentId === currentId) {
          queue.push(templateSetting.id);
        }
      }
    }

    return idsToRemove;
  }

  public async removeTemplatesFromProjectSettings(
    idsToRemove: Set<string>,
    options?: { removeFromFile?: boolean },
  ): Promise<void> {
    if (idsToRemove.size === 0) {
      return;
    }

    this.destinationProjectSettings.instantiatedTemplates =
      this.destinationProjectSettings.instantiatedTemplates.filter(
        (templateSetting) => !idsToRemove.has(templateSetting.id),
      );

    if (
      this.options.dontGenerateTemplateSettings ||
      !options?.removeFromFile
    ) {
      return;
    }

    for (const id of idsToRemove) {
      const removalResult = await removeTemplateFromSettings(
        this.options.absoluteDestinationPath,
        id,
      );

      if ("error" in removalResult) {
        backendLogger.error(
          `Failed to remove template ${id} from templateSettings.json: ${removalResult.error}`,
        );
      }
    }
  }

  public addNewProject(
    userSettings: UserTemplateSettings,
    newUuid?: string,
  ): Result<string> {
    if (this.destinationProjectSettings.instantiatedTemplates.length > 0) {
      backendLogger.error(
        `Project ${this.destinationProjectSettings.projectRepositoryName} already has instantiated templates.`,
      );
      return {
        error: `Project ${this.destinationProjectSettings.projectRepositoryName} already has instantiated templates.`,
      };
    }

    const parsedUserSettings =
      this.rootTemplate.config.templateSettingsSchema.safeParse(userSettings);
    if (!parsedUserSettings.success) {
      backendLogger.error(
        `Failed to parse user settings: ${parsedUserSettings.error}`,
      );
      return {
        error: `Failed to parse user settings: ${parsedUserSettings.error}`,
      };
    }

    const newProjectId = newUuid || crypto.randomUUID();
    const lastMigration = getLatestTemplateMigrationUuid(
      this.rootTemplate.config.migrations,
    );

    this.destinationProjectSettings.instantiatedTemplates.push({
      id: newProjectId,
      templateCommitHash: this.rootTemplate.commitHash,
      templateRepoUrl: this.rootTemplate.repoUrl,
      templateBranch: this.rootTemplate.branch,
      templateName: this.rootTemplate.config.templateConfig.name,
      templateSettings: parsedUserSettings.data,
      lastMigration,
    });

    return { data: newProjectId };
  }

  public addNewTemplate(
    userSettings: UserTemplateSettings,
    templateName: string,
    parentInstanceId: string,
    autoInstantiated?: boolean,
    newUuid?: string,
  ): Result<string> {
    const template = this.rootTemplate.findSubTemplate(templateName);
    if (!template) {
      backendLogger.error(
        `Template ${templateName} could not be found in rootTemplate ${this.rootTemplate.config.templateConfig.name}`,
      );
      return {
        error: `Template ${templateName} could not be found in rootTemplate ${this.rootTemplate.config.templateConfig.name}`,
      };
    }

    const parsedUserSettings =
      template.config.templateSettingsSchema.safeParse(userSettings);
    if (!parsedUserSettings.success) {
      backendLogger.error(
        `Failed to parse user settings: ${parsedUserSettings.error}`,
      );
      return {
        error: `Failed to parse user settings: ${parsedUserSettings.error}`,
      };
    }

    if (!template.config.templateConfig.multiInstance) {
      for (const instantiatedTemplate of this.destinationProjectSettings
        .instantiatedTemplates) {
        if (
          instantiatedTemplate.parentId === parentInstanceId &&
          instantiatedTemplate.templateName === templateName
        ) {
          backendLogger.error(
            `Template ${templateName} is already instantiated.`,
          );
          return {
            error: `Template ${templateName} is already instantiated.`,
          };
        }
      }
    }

    if (
      !this.destinationProjectSettings.projectAuthor ||
      this.destinationProjectSettings.projectAuthor === "abc"
    ) {
      this.destinationProjectSettings.projectAuthor =
        parsedUserSettings.data && "author" in parsedUserSettings.data
          ? (parsedUserSettings.data.author as string)
          : this.rootTemplate.config.templateConfig.author;
    }

    const newProjectId = newUuid || crypto.randomUUID();
    const lastMigration = getLatestTemplateMigrationUuid(
      template.config.migrations,
    );

    this.destinationProjectSettings.instantiatedTemplates.push({
      id: newProjectId,
      parentId: parentInstanceId,
      templateCommitHash: template.commitHash,
      templateRepoUrl: template.repoUrl,
      templateBranch: template.branch,
      automaticallyInstantiatedByParent: autoInstantiated,
      templateName,
      templateSettings: parsedUserSettings.data,
      lastMigration,
    });

    return { data: newProjectId };
  }

  public getFinalTemplateSettings(
    template: Template,
    userSettings: UserTemplateSettings,
    parentInstanceId?: string,
  ): Result<FinalTemplateSettings> {
    return Project.getFinalTemplateSettings(
      template,
      this.destinationProjectSettings,
      userSettings,
      parentInstanceId,
    );
  }

  public async persistNewTemplate(
    instantiatedTemplate: ProjectSettings["instantiatedTemplates"][number],
  ): Promise<Result<void>> {
    if (this.options.dontGenerateTemplateSettings) {
      return { data: undefined };
    }

    return writeNewTemplateToSettings(
      this.options.absoluteDestinationPath,
      instantiatedTemplate,
    );
  }

  public async persistNewProjectSettings(): Promise<Result<void>> {
    if (this.options.dontGenerateTemplateSettings) {
      return { data: undefined };
    }

    return writeNewProjectSettings(
      this.options.absoluteDestinationPath,
      this.destinationProjectSettings,
      false,
    );
  }
}
