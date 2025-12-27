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
import { resolveHardenedSandbox } from "../core/infra/hardened-sandbox";
import { Template } from "./template";
import { backendLogger } from "../lib";
import z from "zod";
import { validateRequiredPluginSettings } from "../core/plugins/plugin-settings";

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
    const errorMessage = `Template ${template.config.templateConfig.name} cannot be used as a child of a template from another repository because it does not define parentFinalSettingsSchema.`;
    backendLogger.error(errorMessage);
    return { error: errorMessage };
  }

  if (!schema) {
    return { data: parentSettings };
  }

  if (parentSettings === undefined) {
    const errorMessage = `Template ${template.config.templateConfig.name} requires parent final settings but none were provided.`;
    backendLogger.error(errorMessage);
    return { error: errorMessage };
  }

  const parsed = schema.safeParse(parentSettings);

  if (!parsed.success) {
    const errorMessage = `Parent final settings validation failed for template ${template.config.templateConfig.name}: ${parsed.error}`;
    backendLogger.error(errorMessage);
    return { error: errorMessage };
  }

  return { data: parsed.data };
}

function buildPluginInputSchema(
  plugins?: LoadedTemplatePlugin[],
): z.ZodTypeAny {
  if (!plugins?.length) {
    return z.object({}).strict().optional();
  }

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const plugin of plugins) {
    shape[plugin.name] = plugin.inputSchema ?? z.object({}).strict();
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
        .object({
          plugins: buildPluginInputSchema(options?.plugins),
        })
        .partial(),
    );

    const parsedUserSettings =
      templateSettingsSchema.safeParse(userProvidedSettings);

    if (!parsedUserSettings?.success) {
      backendLogger.error(
        `Failed to parse user settings: ${parsedUserSettings?.error}`,
      );
      return {
        error: `Failed to parse user settings: ${parsedUserSettings?.error}`,
      };
    }

    const requiredPluginSettingsResult = validateRequiredPluginSettings(
      options?.plugins,
      parsedUserSettings.data,
    );

    if ("error" in requiredPluginSettingsResult) {
      return requiredPluginSettingsResult;
    }

    let parentFinalSettings: FinalTemplateSettings | undefined;

    if (template?.parentTemplate && parentInstanceId) {
      const newInstantiatedSettings =
        Project.getFinalTemplateSettingsForInstantiatedTemplate(
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
      // Execute mapFinalSettings in the hardened sandbox
      const sandbox = resolveHardenedSandbox();
      const mapFn = template.config.mapFinalSettings;
      mappedSettings = sandbox.invokeFunction(mapFn, {
        // Only project metadata - no access to other templates' settings
        projectContext: {
          projectRepositoryName: projectSettings.projectRepositoryName,
          projectAuthor: projectSettings.projectAuthor,
          rootTemplateName: projectSettings.rootTemplateName,
        },
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

    // Strip .plugins from templateFinalSettings to ensure plugins only see
    // pure template settings, not plugin input/output. This ensures bijectional
    // generation by preventing plugins from depending on other plugins' data.
    const { plugins: _pluginsStripped, ...templateSettingsWithoutPlugins } =
      parsedFinalSettings.data;

    const pluginOutputSettings: Record<
      string,
      { version: string; settings: unknown }
    > = {};

    if (options?.plugins?.length) {
      for (const plugin of options.plugins) {
        const pluginsData = parsedUserSettings.data.plugins as
          | Record<string, unknown>
          | undefined;
        const rawPluginInput = pluginsData?.[plugin.name];

        const inputSchema = plugin.inputSchema ?? z.object({}).strict();
        const parsedInput = inputSchema.safeParse(rawPluginInput ?? {});

        if (!parsedInput.success) {
          return {
            error: `Invalid input settings for plugin ${plugin.name}: ${parsedInput.error}`,
          };
        }

        let outputValue: unknown = parsedInput.data;

        if (plugin.computeOutput) {
          try {
            // SECURITY: Execute plugin function in hardened sandbox
            // Pass template settings WITHOUT .plugins to prevent cross-plugin dependencies
            const sandbox = resolveHardenedSandbox();
            outputValue = sandbox.invokeFunction(plugin.computeOutput, {
              templateFinalSettings: templateSettingsWithoutPlugins,
              inputSettings: parsedInput.data as Record<string, unknown>,
              globalConfig: plugin.globalConfig,
            });
          } catch (error) {
            return {
              error: `Failed to compute output for plugin ${plugin.name}: ${error}`,
            };
          }
        }

        const outputSchema = plugin.outputSchema ?? z.object({}).strict();
        const parsedOutput = outputSchema.safeParse(outputValue);
        if (!parsedOutput.success) {
          return {
            error: `Invalid output settings for plugin ${plugin.name}: ${parsedOutput.error}`,
          };
        }

        pluginOutputSettings[plugin.name] = {
          version: plugin.version,
          settings: parsedOutput.data,
        };
      }
    }

    // Plugin output is computed at runtime, not stored.
    // Only input is stored in templateSettings.plugins to ensure bijectional generation.
    const finalSettingsWithPlugins: FinalTemplateSettings = {
      ...templateSettingsWithoutPlugins,
      plugins: pluginOutputSettings,
    };

    return { data: finalSettingsWithPlugins };
  }

  /**
   * Retrieves the final template settings for an instantiated template.
   *
   * NOTE: This returns template settings WITHOUT plugin output. Plugin output
   * is computed at generation time from stored input to ensure bijectional generation.
   * The returned settings will have an empty `plugins` object.
   *
   * @param template - The template definition
   * @param instanceId - The ID of the instantiated template
   * @param instantiatedProjectSettings - The project settings containing all instantiated templates
   * @returns The computed final settings (without plugin output)
   */
  public static getFinalTemplateSettingsForInstantiatedTemplate(
    template: Template,
    instanceId: string,
    instantiatedProjectSettings: ProjectSettings,
  ): Result<FinalTemplateSettings> {
    const projectTemplateSettings =
      instantiatedProjectSettings.instantiatedTemplates.find(
        (t) =>
          t.id === instanceId &&
          t.templateName === template.config.templateConfig.name,
      );
    if (!projectTemplateSettings) {
      const errorMessage = `Template ${template.config.templateConfig.name} with id ${instanceId} not found in project settings`;
      logError({
        shortMessage: errorMessage,
      });
      return { error: errorMessage };
    }

    const parsedUserProvidedSettingsSchema =
      template.config.templateSettingsSchema.safeParse(
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
      const finalParentSettings =
        Project.getFinalTemplateSettingsForInstantiatedTemplate(
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
      // Execute mapFinalSettings in the hardened sandbox
      const sandbox = resolveHardenedSandbox();
      const mapFn = template.config.mapFinalSettings;
      mappedSettings = sandbox.invokeFunction(mapFn, {
        // Only project metadata - no access to other templates' settings
        projectContext: {
          projectRepositoryName:
            instantiatedProjectSettings.projectRepositoryName,
          projectAuthor: instantiatedProjectSettings.projectAuthor,
          rootTemplateName: instantiatedProjectSettings.rootTemplateName,
        },
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

    // Plugin output is NOT computed here - it's computed at generation time only.
    // This ensures bijectional generation: same input always produces same output.
    return {
      data: {
        ...parsedFinalSettings.data,
        plugins: {},
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

    let gitStatus: GitStatus | undefined;

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

    const fullSettings =
      Project.getFinalTemplateSettingsForInstantiatedTemplate(
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
