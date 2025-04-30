import { TemplateSettingsType, UserTemplateSettings } from "@timonteutelink/template-types-lib";
import path from "node:path";
import { GitStatus, ProjectDTO, ProjectSettings, Result } from "../lib/types";
import { loadGitStatus } from "../services/git-service";
import { loadProjectSettings } from "../services/project-settings-service";
import { Template } from "./template";
import { logger } from "../lib/logger";
import { stringOrCallbackToString } from "../lib/utils";
import z from "zod";
import { executeCommand } from "../services/shell-service";

// every project name inside a root project should be unique.
// The root project can be uniquely identified by its name and author.(and version)

export class Project {
  public absoluteRootDir: string;

  public absoluteSettingsPath: string; // path to the templateSettings.json file

  public instantiatedProjectSettings: ProjectSettings;

  public rootTemplate: Template;

  public gitStatus: GitStatus;

  constructor(
    absDir: string,
    absSettingsPath: string,
    projectSettings: ProjectSettings,
    rootTemplate: Template,
    gitStatus: GitStatus,
  ) {
    this.absoluteRootDir = absDir;
    this.absoluteSettingsPath = absSettingsPath;
    this.instantiatedProjectSettings = projectSettings;
    this.rootTemplate = rootTemplate;
    this.gitStatus = gitStatus;
  }

  /**
   * Aggregates all settings of the provided template and all parent templates inside of this project. If the template or any of the parents are not initialized in this project return an empty object
   * can be called recursively with parent templates to assemble a final object of all templates up to the root template.
   */
  public static getInstantiatedSettings(
    template: Template,
    instanceId: string,
    instantiatedProjectSettings: ProjectSettings,
  ): Result<UserTemplateSettings> {
    let instantiatedSettings: UserTemplateSettings = {};
    const projectTemplateSettings =
      instantiatedProjectSettings.instantiatedTemplates.find(
        (t) =>
          t.id === instanceId &&
          t.templateName === template.config.templateConfig.name,
      );
    if (!projectTemplateSettings) {
      logger.error(
        `Template ${template.config.templateConfig.name} with id ${instanceId} not found in project settings`,
      );
      return { data: instantiatedSettings };
    }

    const parsedSchema = template.config.templateSettingsSchema.safeParse(
      projectTemplateSettings.templateSettings,
    );

    if (!parsedSchema.success) {
      logger.error(
        `Invalid template settings for template ${template.config.templateConfig.name}: ${parsedSchema.error}`,
      );
      return { error: `${parsedSchema.error}` };
    }

    instantiatedSettings = parsedSchema.data;

    const parentTemplate = template.parentTemplate;
    if (parentTemplate && projectTemplateSettings.parentId) {
      const parentSettings = Project.getInstantiatedSettings(
        parentTemplate,
        projectTemplateSettings.parentId,
        instantiatedProjectSettings,
      );
      if ("error" in parentSettings) {
        return { error: parentSettings.error };
      }
      Object.assign(instantiatedSettings, parentSettings.data);
    }
    return { data: instantiatedSettings };
  }

  static async create(absDir: string): Promise<Result<Project>> {
    const projectSettingsPath = path.join(absDir, "templateSettings.json");
    const projectSettings = await loadProjectSettings(projectSettingsPath);

    if ("error" in projectSettings) {
      return { error: projectSettings.error };
    }

    const gitStatus = await loadGitStatus(absDir);

    if ("error" in gitStatus) {
      return {
        error: gitStatus.error,
      };
    }

    return {
      data: new Project(
        absDir,
        projectSettingsPath,
        projectSettings.data.settings,
        projectSettings.data.rootTemplate,
        gitStatus.data,
      ),
    };
  }

  async executeTemplateCommand(
    templateInstanceId: string,
    commandTitle: string,
  ): Promise<Result<string>> {
    const instantiatedTemplate = this.instantiatedProjectSettings.instantiatedTemplates.find(
      (t) => t.id === templateInstanceId,
    );
    if (!instantiatedTemplate) {
      logger.error(
        `Template with id ${templateInstanceId} not found in project settings`,
      );
      return {
        error: `Template with id ${templateInstanceId} not found in project settings`,
      };
    }
    const template = this.rootTemplate.findSubTemplate(
      instantiatedTemplate.templateName,
    );
    if (!template) {
      logger.error(
        `Template ${instantiatedTemplate.templateName} not found in project`,
      );
      return {
        error: `Template ${instantiatedTemplate.templateName} not found in project`,
      };
    }

    const templateCommand = template.config.commands?.find(
      (c) => c.title === commandTitle,
    );

    if (!templateCommand) {
      logger.error(
        `Command ${commandTitle} not found in template ${template.config.templateConfig.name}`,
      );
      return {
        error: `Command ${commandTitle} not found in template ${template.config.templateConfig.name}`,
      };
    }

    const fullSettings = Project.getInstantiatedSettings(
      template,
      templateInstanceId,
      this.instantiatedProjectSettings,
    );

    if ("error" in fullSettings) {
      return fullSettings;
    }

    const fullProjectSettings: TemplateSettingsType<z.AnyZodObject> = {
      project_name: this.instantiatedProjectSettings.projectName,
      fullSettings: fullSettings.data,
    }

    const commandToExecute = stringOrCallbackToString(templateCommand.command, fullProjectSettings);

    if ('error' in commandToExecute) {
      return commandToExecute;
    }

    const commandCwdPath = path.join(this.absoluteRootDir, templateCommand.path || '.');

    const commandResult = await executeCommand(commandCwdPath, commandToExecute.data);

    if ('error' in commandResult) {
      return commandResult;
    }

    return {
      data: commandResult.data,
    };
  }

  public mapToDTO(): Result<ProjectDTO> {
    return {
      data: {
        name: this.instantiatedProjectSettings.projectName,
        absPath: this.absoluteRootDir,
        rootTemplateName: this.instantiatedProjectSettings.rootTemplateName,
        settings: this.instantiatedProjectSettings,
        gitStatus: this.gitStatus,
        outdatedTemplate: !this.rootTemplate.isDefault
      },
    };
  }
}
