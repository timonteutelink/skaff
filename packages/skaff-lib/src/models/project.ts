import {
  FinalTemplateSettings,
  ProjectSettings,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import { LoadedTemplatePlugin } from "../core/plugins";
import path from "node:path";
import { GitStatus, ProjectDTO, Result } from "../lib/types";
import { logError, stringOrCallbackToString } from "../lib/utils";
import { resolveGitService } from "../core/infra/git-service";
import { loadProjectSettings } from "../core/projects/project-settings-service";
import { resolveShellService } from "../core/infra/shell-service";
import { Template } from "./template";
import { backendLogger } from "../lib";
import z from "zod";

// Every project repository name inside a root project should be unique.
// The root project can be uniquely identified by its repository name and author (and version).

function isCrossRepoChild(template: Template): boolean {
  if (!template.parentTemplate) {
    return false;
  }

  return (
    path.resolve(template.absoluteBaseDir) !==
    path.resolve(template.parentTemplate.absoluteBaseDir)
  );
}

function validateParentFinalSettings(
  template: Template,
  parentSettings?: FinalTemplateSettings,
): Result<FinalTemplateSettings | undefined> {
  const requiresSchema = isCrossRepoChild(template);
  const schema = template.config.parentFinalSettingsSchema;

  if (requiresSchema && !schema) {
    const errorMessage =
      `Template ${template.config.templateConfig.name} cannot be used as a child of a template from another repository because it does not define parentFinalSettingsSchema.`;
    backendLogger.error(errorMessage);
    return { error: errorMessage };
  }

  if (!schema) {
    return { data: parentSettings };
  }

  if (parentSettings === undefined) {
    const errorMessage =
      `Template ${template.config.templateConfig.name} requires parent final settings but none were provided.`;
    backendLogger.error(errorMessage);
    return { error: errorMessage };
  }

  const parsed = schema.safeParse(parentSettings);

  if (!parsed.success) {
    const errorMessage =
      `Parent final settings validation failed for template ${template.config.templateConfig.name}: ${parsed.error}`;
    backendLogger.error(errorMessage);
    return { error: errorMessage };
  }

  return { data: parsed.data };
}

function buildPluginTemplateSettingsSchema(
  plugins?: LoadedTemplatePlugin[],
): z.ZodTypeAny {
  if (!plugins?.length) {
    return z.object({}).strict().optional();
  }

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const plugin of plugins) {
    shape[plugin.name] =
      plugin.additionalTemplateSettingsSchema ?? z.object({}).strict();
  }

  return z.object(shape).partial().strict();
}

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
    options?: { templateInstanceId?: string; plugins?: LoadedTemplatePlugin[] },
  ): Result<FinalTemplateSettings> {
    const templateSettingsSchema = template.config.templateSettingsSchema.merge(
      z
        .object({ plugins: buildPluginTemplateSettingsSchema(options?.plugins) })
        .partial(),
    );

    const parsedUserSettings = templateSettingsSchema.safeParse(
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

      const validatedParentSettings = validateParentFinalSettings(
        template,
        newInstantiatedSettings.data,
      );

      if ("error" in validatedParentSettings) {
        return validatedParentSettings;
      }

      parentFinalSettings = validatedParentSettings.data;
    }

    const templateName = template.config.templateConfig.name;
    let mappedSettings: FinalTemplateSettings;
    try {
      mappedSettings = template.config.mapFinalSettings({
        fullProjectSettings: projectSettings,
        templateSettings: parsedUserSettings.data,
        parentSettings: parentFinalSettings,
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

    const pluginFinalSettings: Record<
      string,
      { version: string; settings: unknown }
    > = {};

    if (options?.plugins?.length) {
      for (const plugin of options.plugins) {
        const rawPluginSettings = parsedUserSettings.data.plugins?.[
          plugin.name
        ];

        const additionalSchema =
          plugin.additionalTemplateSettingsSchema ?? z.object({}).strict();
        const parsedPluginSettings = additionalSchema.safeParse(
          rawPluginSettings ?? {},
        );

        if (!parsedPluginSettings.success) {
          return {
            error: `Invalid settings for plugin ${plugin.name}: ${parsedPluginSettings.error}`,
          };
        }

        let pluginFinalSettingsValue: unknown = parsedPluginSettings.data;

        if (plugin.getFinalTemplateSettings) {
          try {
            pluginFinalSettingsValue = plugin.getFinalTemplateSettings({
              templateFinalSettings: parsedFinalSettings.data,
              additionalTemplateSettings: parsedPluginSettings.data,
              systemSettings: plugin.systemSettings,
            });
          } catch (error) {
            return {
              error: `Failed to resolve final settings for plugin ${plugin.name}: ${error}`,
            };
          }
        }

        const pluginFinalSchema =
          plugin.pluginFinalSettingsSchema ?? z.object({}).strict();
        const parsed = pluginFinalSchema.safeParse(pluginFinalSettingsValue);
        if (!parsed.success) {
          return {
            error: `Invalid final settings for plugin ${plugin.name}: ${parsed.error}`,
          };
        }

        pluginFinalSettings[plugin.name] = {
          version: plugin.version,
          settings: parsed.data,
        };
      }
    }

    const finalSettingsWithPlugins: FinalTemplateSettings = {
      ...parsedFinalSettings.data,
      plugins: pluginFinalSettings,
    };

    if (options?.templateInstanceId) {
      const instantiated = projectSettings.instantiatedTemplates.find(
        (entry) => entry.id === options.templateInstanceId,
      );

      if (instantiated) {
        instantiated.plugins = pluginFinalSettings;
      }
    }

    return { data: finalSettingsWithPlugins };
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

      const validatedParentSettings = validateParentFinalSettings(
        template,
        finalParentSettings.data,
      );

      if ("error" in validatedParentSettings) {
        return { error: validatedParentSettings.error };
      }

      parentSettings = validatedParentSettings.data;
    } else if (parentTemplate) {
      const validation = validateParentFinalSettings(template, undefined);
      if ("error" in validation) {
        return { error: validation.error };
      }
      parentSettings = validation.data;
    }

    const templateName = template.config.templateConfig.name;
    let mappedSettings: FinalTemplateSettings;
    try {
      mappedSettings = template.config.mapFinalSettings({
        fullProjectSettings: instantiatedProjectSettings,
        templateSettings: parsedUserProvidedSettingsSchema.data,
        parentSettings: parentSettings,
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

    return {
      data: {
        ...parsedFinalSettings.data,
        plugins: projectTemplateSettings.plugins ?? {},
      },
    };
  }

  static async create(absDir: string): Promise<Result<Project>> {
    const projectSettingsPath = path.join(absDir, "templateSettings.json");
    const projectSettings = await loadProjectSettings(projectSettingsPath);

    if ("error" in projectSettings) {
      return { error: projectSettings.error };
    }

    const gitService = resolveGitService();
    const isGitRepoResult = await gitService.isGitRepo(absDir);

    if ("error" in isGitRepoResult) {
      return { error: isGitRepoResult.error };
    }

    let gitStatus: GitStatus | undefined

    if (isGitRepoResult.data) {
      const gitStatusResult = await gitService.loadGitStatus(absDir);
      if ("error" in gitStatusResult) {
        return { error: gitStatusResult.error };
      }
      gitStatus = gitStatusResult.data;
    }

    const outdated = false;

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

    const commandResult = await resolveShellService().execute(
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
        name: this.instantiatedProjectSettings.projectRepositoryName,
        absPath: this.absoluteRootDir,
        rootTemplateName: this.instantiatedProjectSettings.rootTemplateName,
        settings: this.instantiatedProjectSettings,
        gitStatus: this.gitStatus,
        outdatedTemplate: this.outdatedTemplate,
      },
    };
  }
}
