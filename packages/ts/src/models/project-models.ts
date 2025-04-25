import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import path from "node:path";
import { GitStatus, ProjectDTO, ProjectSettings, Result } from "../lib/types";
import { loadGitStatus } from "../services/git-service";
import { loadProjectSettings } from "../services/project-settings-service";
import { Template } from "./template-models";

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
      console.error(
        `Template ${template.config.templateConfig.name} with id ${instanceId} not found in project settings`,
      );
      return { data: instantiatedSettings };
    }

    const parsedSchema = template.config.templateSettingsSchema.safeParse(
      projectTemplateSettings.templateSettings,
    );

    if (!parsedSchema.success) {
      console.error(
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
        console.error(
          `Failed to get instantiated settings for parent template ${parentTemplate.config.templateConfig.name}: ${parentSettings.error}`,
        );
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
      console.error(
        `Failed to load project settings from ${projectSettingsPath}: ${projectSettings.error}`,
      );
      return { error: projectSettings.error };
    }

    const gitStatus = await loadGitStatus(absDir);

    if ("error" in gitStatus) {
      console.error(
        `Failed to load git status for project at ${absDir}: ${gitStatus.error}`,
      );
      return {
        error: `Failed to load git status for project at ${absDir}`,
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
