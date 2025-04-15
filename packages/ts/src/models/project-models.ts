import * as fs from "node:fs/promises";
import path from "node:path";
import {
  GitStatus,
  ProjectDTO,
  ProjectSettings,
  ProjectSettingsSchema,
  Result,
} from "../utils/types";
import { Template } from "./template-models";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { ROOT_TEMPLATE_REGISTRY } from "../services/root-template-registry-service";
import { loadGitStatus } from "../services/git-service";
import { PROJECT_REGISTRY } from "../services/project-registry-service";
import { TemplateGeneratorService } from "../services/template-generator-service";
import { PROJECT_SEARCH_PATHS } from "../utils/env";

// every project name inside a root project should be unique.
//
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

  public static async writeNewProjectSettings(
    absoluteProjectPath: string,
    projectSettings: ProjectSettings,
    overwrite?: boolean,
  ): Promise<Result<void>> {
    const projectSettingsPath = path.join(
      absoluteProjectPath,
      "templateSettings.json",
    );
    if (!overwrite) {
      try {
        await fs.access(projectSettingsPath);
        return {
          error: `Project settings file already exists at ${projectSettingsPath}`,
        };
      } catch {
        // File does not exist, continue
      }
    }
    try {
      await fs.mkdir(absoluteProjectPath, { recursive: true });
      const serializedProjectSettings = JSON.stringify(
        projectSettings,
        null,
        2,
      );
      await fs.writeFile(
        projectSettingsPath,
        serializedProjectSettings,
        "utf-8",
      );
    } catch (error) {
      return { error: `Failed to write templateSettings.json: ${error}` };
    }
    return { data: undefined };
  }

  public static async addTemplateToSettings(
    absoluteProjectPath: string,
    parentInstanceId: string,
    template: Template,
    templateSettings: UserTemplateSettings,
    autoInstantiated?: boolean,
    uuid?: string,
  ): Promise<Result<string>> {
    const projectSettingsPath = path.join(
      absoluteProjectPath,
      "templateSettings.json",
    );
    const projectSettingsResult =
      await Project.loadProjectSettings(projectSettingsPath);
    if ("error" in projectSettingsResult) {
      return { error: projectSettingsResult.error };
    }
    const projectSettings = projectSettingsResult.data.settings;
    const newTemplateInstanceId = uuid || crypto.randomUUID();
    projectSettings.instantiatedTemplates.push({
      id: newTemplateInstanceId,
      parentId: parentInstanceId,
      templateName: template.config.templateConfig.name,
      templateSettings,
      automaticallyInstantiatedByParent: autoInstantiated,
    });
    const result = await Project.writeNewProjectSettings(
      absoluteProjectPath,
      projectSettings,
      true,
    );
    if ("error" in result) {
      return { error: result.error };
    }

    return { data: newTemplateInstanceId };
  }

  private static async loadProjectSettings(
    projectSettingsPath: string,
  ): Promise<Result<{ settings: ProjectSettings; rootTemplate: Template }>> {
    const projectSettings = await fs.readFile(projectSettingsPath, "utf-8");
    const parsedProjectSettings = JSON.parse(projectSettings);
    const finalProjectSettings = ProjectSettingsSchema.safeParse(
      parsedProjectSettings,
    );
    if (!finalProjectSettings.success) {
      return {
        error: `Invalid templateSettings.json: ${finalProjectSettings.error}`,
      };
    }
    const rootTemplate = await ROOT_TEMPLATE_REGISTRY.findTemplate(
      finalProjectSettings.data.rootTemplateName,
    );
    if ("error" in rootTemplate) {
      return { error: rootTemplate.error };
    }

    for (const subTemplateSettings of finalProjectSettings.data
      .instantiatedTemplates) {
      const subTemplate = rootTemplate.data.findSubTemplate(
        subTemplateSettings.templateName,
      );
      if (!subTemplate) {
        return {
          error: `Template ${subTemplateSettings.templateName} not found in root template ${finalProjectSettings.data.rootTemplateName}`,
        };
      }

      const subTemplateSettingsSchema =
        subTemplate.config.templateSettingsSchema.safeParse(
          subTemplateSettings.templateSettings,
        );
      if (!subTemplateSettingsSchema.success) {
        return {
          error: `Invalid templateSettings.json for template ${subTemplateSettings.templateName}: ${subTemplateSettingsSchema.error}`,
        };
      }
    }

    const instantiatedProjectSettings = {
      settings: finalProjectSettings.data,
      rootTemplate: rootTemplate.data,
    };
    return { data: instantiatedProjectSettings };
  }

  /**
   * Aggregates all settings of the provided template and all parent templates inside of this project. If the template or any of the parents are not initialized in this project return an empty object
   * can be called recursively with parent templates to assemble a final object of all templates up to the root template.
   */
  getInstantiatedSettings(
    template: Template,
    instanceId: string,
  ): UserTemplateSettings {
    const instantiatedSettings: UserTemplateSettings = {};
    const projectTemplateSettings =
      this.instantiatedProjectSettings.instantiatedTemplates.find(
        (t) =>
          t.id === instanceId &&
          t.templateName === template.config.templateConfig.name,
      );
    if (!projectTemplateSettings) {
      return instantiatedSettings;
    }
    instantiatedSettings[template.config.templateConfig.name] =
      template.config.templateSettingsSchema.parse(
        projectTemplateSettings.templateSettings,
      );

    const parentTemplate = template.parentTemplate;
    if (parentTemplate && projectTemplateSettings.parentId) {
      const parentSettings = this.getInstantiatedSettings(
        parentTemplate,
        projectTemplateSettings.parentId,
      );
      Object.assign(instantiatedSettings, parentSettings);
    }
    return instantiatedSettings;
  }

  static async create(absDir: string): Promise<Result<Project>> {
    const projectSettingsPath = path.join(absDir, "templateSettings.json");
    const projectSettings =
      await Project.loadProjectSettings(projectSettingsPath);
    if ("error" in projectSettings) {
      return { error: projectSettings.error };
    }

    const gitStatus = await loadGitStatus(absDir);

    if (!gitStatus) {
      console.error(
        `Failed to load git status for project at ${absDir}`
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
        gitStatus
      ),
    };
  }

  public mapToDTO(): ProjectDTO {
    return {
      name: this.instantiatedProjectSettings.projectName,
      absPath: this.absoluteRootDir,
      rootTemplateName: this.instantiatedProjectSettings.rootTemplateName,
      settings: this.instantiatedProjectSettings,
      gitStatus: this.gitStatus,
    };
  }
}

// Will be used manually by user and when generating diff for adding template to project
export async function generateProjectFromTemplateSettings(currentProjectName: string, newProjectName: string, destinationDirPath: string): Promise<Result<string>> {
  const project = await PROJECT_REGISTRY.findProject(currentProjectName);

  if (!project) {
    return { error: "Project not found" };
  }

  const templateSettings = project.instantiatedProjectSettings;

  const rootTemplate = await ROOT_TEMPLATE_REGISTRY.findTemplate(templateSettings.rootTemplateName);

  if ("error" in rootTemplate) {
    return { error: rootTemplate.error };
  }

  const newProjectPath = `${destinationDirPath}/${newProjectName}`;

  const newProjectGenerator = new TemplateGeneratorService(
    {
      mode: 'standalone', absoluteDestinationPath: newProjectPath,
    },
    rootTemplate.data,
  );

  const instatiationResult = await newProjectGenerator.instantiateFullProjectFromSettings(templateSettings);

  if ("error" in instatiationResult) {
    return { error: "Failed to create project" };
  }

  return { data: newProjectPath };
}
