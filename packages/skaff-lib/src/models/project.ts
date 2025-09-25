import {
  FinalTemplateSettings,
  ProjectSettings,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import path from "node:path";
import { GitStatus, ProjectDTO, Result } from "../lib/types";
import { logError, stringOrCallbackToString } from "../lib/utils";
import { isGitRepo, loadGitStatus, getRemoteCommitHash } from "../core/infra/git-service";
import { loadProjectSettings } from "../core/projects/project-settings-service";
import { executeCommand } from "../core/infra/shell-service";
import { Template } from "./template";
import { backendLogger } from "../lib";

// every project name inside a root project should be unique.
// The root project can be uniquely identified by its name and author.(and version)

export class Project {
  public absoluteRootDir: string;

  public absoluteSettingsPath: string; // path to the templateSettings.json file

  public instantiatedProjectSettings: ProjectSettings;

  public rootTemplate: Template;

  public gitStatus?: GitStatus;
  public outdatedTemplate: boolean;

  constructor(
    absDir: string,
    absSettingsPath: string,
    projectSettings: ProjectSettings,
    rootTemplate: Template,
    gitStatus?: GitStatus,
    outdatedTemplate: boolean = false,
  ) {
    this.absoluteRootDir = absDir;
    this.absoluteSettingsPath = absSettingsPath;
    this.instantiatedProjectSettings = projectSettings;
    this.rootTemplate = rootTemplate;
    this.gitStatus = gitStatus;
    this.outdatedTemplate = outdatedTemplate;
  }

  /**
   * Retrieves the final template settings for a given template and user provided settings.
   * If the template has a parent, it will also retrieve the parent's final settings.
   *
   * @param template - The template to get the final settings for.
   * @param projectSettings - The project settings containing instantiated templates.
   * @param userProvidedSettings - The user provided settings for the template.
   * @param parentInstanceId - Optional ID of the parent instance if applicable.
   * @returns Result containing FinalTemplateSettings or an error message.
   */
  public static getFinalTemplateSettings(
    template: Template,
    projectSettings: ProjectSettings,
    userProvidedSettings: UserTemplateSettings,
    parentInstanceId?: string,
  ): Result<FinalTemplateSettings> {
    const parsedUserSettings = template.config.templateSettingsSchema.safeParse(
      userProvidedSettings,
    );

    if (!parsedUserSettings?.success) {
      backendLogger.error(`Failed to parse user settings: ${parsedUserSettings?.error}`);
      return {
        error: `Failed to parse user settings: ${parsedUserSettings?.error}`,
      };
    }

    let parentFinalSettings: FinalTemplateSettings | undefined;

    if (
      template?.parentTemplate &&
      parentInstanceId
    ) {
      const newInstantiatedSettings = Project.getFinalTemplateSettingsForInstantiatedTemplate(
        template.parentTemplate,
        parentInstanceId,
        projectSettings,
      );

      if ("error" in newInstantiatedSettings) {
        return newInstantiatedSettings;
      }

      parentFinalSettings = newInstantiatedSettings.data;
    }

    const templateName = template.config.templateConfig.name;
    let mappedSettings: FinalTemplateSettings;
    try {
      mappedSettings = template.config.mapFinalSettings({
        fullProjectSettings: projectSettings,
        templateSettings: parsedUserSettings.data,
        parentSettings: parentFinalSettings,
        aiResults: {},
      });
    } catch (error) {
      logError({
        shortMessage: `Failed to map final settings for template ${templateName}`,
        error,
      });
      return {
        error: `Failed to map final settings for template ${templateName}: ${error}`,
      };
    }

    const parsedFinalSettings =
      template.config.templateFinalSettingsSchema.safeParse(mappedSettings);
    if (!parsedFinalSettings.success) {
      backendLogger.error(
        `Invalid final template settings for template ${templateName}: ${parsedFinalSettings.error}`,
      );
      return {
        error: `Invalid final template settings for template ${templateName}: ${parsedFinalSettings.error}`,
      };
    }

    return { data: parsedFinalSettings.data };
  }

  /**
   * Retrieves the final template settings for an instantiated template.
   */
  public static getFinalTemplateSettingsForInstantiatedTemplate(
    template: Template,
    instanceId: string,
    instantiatedProjectSettings: ProjectSettings,
  ): Result<FinalTemplateSettings> {
    const projectTemplateSettings = instantiatedProjectSettings.instantiatedTemplates.find(
      (t) =>
        t.id === instanceId &&
        t.templateName === template.config.templateConfig.name,
    );
    if (!projectTemplateSettings) {
      const errorMessage =
        `Template ${template.config.templateConfig.name} with id ${instanceId} not found in project settings`;
      logError({
        shortMessage: errorMessage,
      });
      return { error: errorMessage };
    }

    const parsedUserProvidedSettingsSchema = template.config.templateSettingsSchema.safeParse(
      projectTemplateSettings.templateSettings,
    );

    if (!parsedUserProvidedSettingsSchema.success) {
      logError({
        shortMessage: `Invalid template settings for template ${template.config.templateConfig.name}: ${parsedUserProvidedSettingsSchema.error}`,
      });
      return { error: `${parsedUserProvidedSettingsSchema.error}` };
    }

    const parentTemplate = template.parentTemplate;

    let parentSettings: FinalTemplateSettings | undefined;

    if (parentTemplate && projectTemplateSettings.parentId) {
      const finalParentSettings = Project.getFinalTemplateSettingsForInstantiatedTemplate(
        parentTemplate,
        projectTemplateSettings.parentId,
        instantiatedProjectSettings,
      );
      if ("error" in finalParentSettings) {
        return { error: finalParentSettings.error };
      }

      parentSettings = finalParentSettings.data;
    }

    const templateName = template.config.templateConfig.name;
    let mappedSettings: FinalTemplateSettings;
    try {
      mappedSettings = template.config.mapFinalSettings({
        fullProjectSettings: instantiatedProjectSettings,
        templateSettings: parsedUserProvidedSettingsSchema.data,
        parentSettings: parentSettings,
        aiResults: {},
      });
    } catch (error) {
      logError({
        shortMessage: `Failed to map final settings for template ${templateName}`,
        error,
      });
      return {
        error: `Failed to map final settings for template ${templateName}: ${error}`,
      };
    }

    const parsedFinalSettings =
      template.config.templateFinalSettingsSchema.safeParse(mappedSettings);
    if (!parsedFinalSettings.success) {
      backendLogger.error(
        `Invalid final template settings for template ${templateName}: ${parsedFinalSettings.error}`,
      );
      return {
        error: `Invalid final template settings for template ${templateName}: ${parsedFinalSettings.error}`,
      };
    }

    return { data: parsedFinalSettings.data };
  }

  static async create(absDir: string): Promise<Result<Project>> {
    const projectSettingsPath = path.join(absDir, "templateSettings.json");
    const projectSettings = await loadProjectSettings(projectSettingsPath);

    if ("error" in projectSettings) {
      return { error: projectSettings.error };
    }

    const isGitRepoResult = await isGitRepo(absDir);

    if ("error" in isGitRepoResult) {
      return { error: isGitRepoResult.error };
    }

    let gitStatus: GitStatus | undefined

    if (isGitRepoResult.data) {
      const gitStatusResult = await loadGitStatus(absDir);
      if ("error" in gitStatusResult) {
        return { error: gitStatusResult.error };
      }
      gitStatus = gitStatusResult.data;
    }

    let outdated = false;
    const rootInstantiated = projectSettings.data.settings.instantiatedTemplates[0];
    if (
      rootInstantiated?.templateRepoUrl &&
      rootInstantiated.templateBranch &&
      rootInstantiated.templateCommitHash
    ) {
      const remote = await getRemoteCommitHash(
        rootInstantiated.templateRepoUrl,
        rootInstantiated.templateBranch,
      );
      if ("data" in remote && remote.data !== rootInstantiated.templateCommitHash) {
        outdated = true;
      }
    }

    return {
      data: new Project(
        absDir,
        projectSettingsPath,
        projectSettings.data.settings,
        projectSettings.data.rootTemplate,
        gitStatus,
        outdated,
      ),
    };
  }

  async executeTemplateCommand(
    templateInstanceId: string,
    commandTitle: string,
  ): Promise<Result<string>> {
    const instantiatedTemplate =
      this.instantiatedProjectSettings.instantiatedTemplates.find(
        (t) => t.id === templateInstanceId,
      );
    if (!instantiatedTemplate) {
      logError({
        shortMessage: `Template with id ${templateInstanceId} not found in project settings`,
      });
      return {
        error: `Template with id ${templateInstanceId} not found in project settings`,
      };
    }
    const template = this.rootTemplate.findSubTemplate(
      instantiatedTemplate.templateName,
    );
    if (!template) {
      logError({
        shortMessage: `Template ${instantiatedTemplate.templateName} not found in project`,
      });
      return {
        error: `Template ${instantiatedTemplate.templateName} not found in project`,
      };
    }

    const templateCommand = template.config.commands?.find(
      (c) => c.title === commandTitle,
    );

    if (!templateCommand) {
      logError({
        shortMessage: `Command ${commandTitle} not found in template ${template.config.templateConfig.name}`,
      });
      return {
        error: `Command ${commandTitle} not found in template ${template.config.templateConfig.name}`,
      };
    }

    const fullSettings = Project.getFinalTemplateSettingsForInstantiatedTemplate(
      template,
      templateInstanceId,
      this.instantiatedProjectSettings,
    );

    if ("error" in fullSettings) {
      return fullSettings;
    }

    const commandToExecute = stringOrCallbackToString(
      templateCommand.command,
      fullSettings.data,
    );

    if ("error" in commandToExecute) {
      return commandToExecute;
    }

    const commandCwdPath = path.join(
      this.absoluteRootDir,
      templateCommand.path || ".",
    );

    const commandResult = await executeCommand(
      commandCwdPath,
      commandToExecute.data,
    );

    if ("error" in commandResult) {
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
        outdatedTemplate: this.outdatedTemplate,
      },
    };
  }
}
