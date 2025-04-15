import {
  UserTemplateSettings,
  SideEffectFunction,
  TemplateSettingsType,
} from "@timonteutelink/template-types-lib";
import fs from "fs-extra";
import { glob } from "glob";
import Handlebars from "handlebars";
import * as path from "node:path";
import { Template } from "../models/template-models";
import { anyOrCallbackToAny, stringOrCallbackToString } from "../utils/utils";
import { CreateProjectResult, ProjectSettings, Result } from "../utils/types";
import z from "zod";
import { PROJECT_REGISTRY } from "./project-registry-service";
import { addAllAndDiff, commitAll, createGitRepo } from "./git-service";
import { Project } from "../models/project-models";
import { addTemplateToSettings, writeNewProjectSettings } from "./project-settings.service";
import { getParsedUserSettingsWithParentSettings } from "./project-service";
import { makeDir } from "./file-service";

export interface GeneratorOptions {
  /**
   * Mode of operation: in "traditional" mode the service will create a git repo,
   * update the project settings file, and track changes. In "standalone" mode it will just
   * output the templated files without tracking.
   *
   * Default is "traditional".
   */
  mode: "traditional" | "standalone";

  /**
   * If true, the template generator will not generate the template settings file.
   */
  dontGenerateTemplateSettings?: boolean;

  /**
   * The absolute path to the destination directory where the template will be generated.
   * Should be the root project dir or the directory where the individual template should be stored.
   * This should be a valid path on the filesystem.
   */
  absoluteDestinationPath: string;
}

export class TemplateGeneratorService {
  public options: GeneratorOptions;
  public destinationProject?: Project;
  public projectName: string;
  public rootTemplate: Template;

  // Values set when generating a template. Should always be set again before generating a new template.
  private currentlyGeneratingTemplate?: Template;
  private currentlyGeneratingTemplateParentInstanceId?: string;
  private currentlyGeneratingTemplateFullSettings?: TemplateSettingsType<z.AnyZodObject>;

  constructor(
    options: GeneratorOptions,
    rootTemplate: Template,
    projectName: string,
    destinationProject?: Project,
  ) {
    this.options = options;
    this.destinationProject = destinationProject;
    this.projectName = projectName;
    this.rootTemplate = rootTemplate.findRootTemplate();
  }

  private updateParsedUserSettingsWithParentSettings(userSettings: UserTemplateSettings): Result<void> {
    if (!this.currentlyGeneratingTemplate) {
      return { error: "No template is currently being generated." };
    }
    const result = getParsedUserSettingsWithParentSettings(userSettings, this.currentlyGeneratingTemplate, this.projectName, this.currentlyGeneratingTemplateParentInstanceId, this.destinationProject?.instantiatedProjectSettings);

    if ("error" in result) {
      console.error(`Failed to parse user settings: ${result.error}`);
      return { error: `Failed to parse user settings: ${result.error}` };
    }

    this.currentlyGeneratingTemplateFullSettings = result.data;

    return { data: undefined };
  }

  private getTargetPath(): string {
    if (
      !this.currentlyGeneratingTemplate ||
      !this.currentlyGeneratingTemplateFullSettings
    ) {
      throw new Error("No template is currently being generated.");
    }
    const targetPath = this.currentlyGeneratingTemplate.config.targetPath;
    if (!targetPath) {
      return ".";
    }
    return stringOrCallbackToString(
      targetPath,
      this.currentlyGeneratingTemplateFullSettings,
    );
  }

  private getAbsoluteTargetPath(): string {
    return path.join(this.options.absoluteDestinationPath, this.getTargetPath());
  }

  private getRedirects(): { from: string; to: string }[] {
    if (
      !this.currentlyGeneratingTemplate ||
      !this.currentlyGeneratingTemplateFullSettings
    ) {
      throw new Error("No template is currently being generated.");
    }
    const redirects = this.currentlyGeneratingTemplate.config.redirects;
    const fullSettings = this.currentlyGeneratingTemplateFullSettings;
    if (!redirects) {
      return [];
    }
    return redirects.map((redirect) => ({
      from: stringOrCallbackToString(redirect.from, fullSettings),
      to: stringOrCallbackToString(redirect.to, fullSettings),
    }));
  }

  /**
   * Copies all files from the template’s adjacent "templates" directory to the destination.
   * Files are processed with Handlebars. If a file ends in ".hbs", the extension is removed.
   */
  private async copyDirectory(): Promise<void> {
    if (!this.currentlyGeneratingTemplate) {
      throw new Error("No template is currently being generated.");
    }
    const src = this.currentlyGeneratingTemplate.absoluteTemplatesDir;
    const dest = this.getAbsoluteTargetPath();
    const redirects = this.getRedirects();

    await makeDir(dest);

    const entries = await glob(`**/*`, { cwd: src, dot: true, nodir: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      let destPath = path.join(dest, entry);

      if (destPath.endsWith(".hbs")) {
        destPath = destPath.slice(0, -4);
      }

      for (const redirect of redirects) {
        if (destPath.endsWith(redirect.from)) {
          destPath = path.join(dest, redirect.to);
          break;
        }
      }

      const stats = await fs.stat(srcPath);
      if (stats.isDirectory()) continue;

      const content = await fs.readFile(srcPath, "utf-8");
      const compiled = Handlebars.compile(content);
      const result = compiled(this.currentlyGeneratingTemplateFullSettings);

      await fs.ensureDir(path.dirname(destPath));
      await fs.writeFile(destPath, result, "utf-8");

      console.log(`Generated: ${destPath}`);
    }
  }

  /**
   * Applies side effects defined in the template configuration.
   */
  private async applySideEffects(): Promise<void> {
    if (
      !this.currentlyGeneratingTemplate ||
      !this.currentlyGeneratingTemplateFullSettings
    ) {
      throw new Error("No template is currently being generated.");
    }
    const sideEffects = this.currentlyGeneratingTemplate.config.sideEffects;
    const fullSettings = this.currentlyGeneratingTemplateFullSettings;
    await Promise.all(
      sideEffects?.map(({ filePath, apply }) => {
        return this.applySideEffect(
          stringOrCallbackToString(filePath, fullSettings),
          apply,
        );
      }) || [],
    );
  }

  /**
   * Reads the target file, applies the side effect function using Handlebars templating data, and writes the new content.
   */
  private async applySideEffect(
    filePath: string,
    sideEffectFunction: SideEffectFunction,
  ) {
    if (
      !this.currentlyGeneratingTemplate ||
      !this.currentlyGeneratingTemplateFullSettings
    ) {
      throw new Error("No template is currently being generated.");
    }
    const absoluteFilePath = path.join(
      this.options.absoluteDestinationPath,
      filePath,
    );
    let oldFileContents = "";
    try {
      oldFileContents = await fs.readFile(absoluteFilePath, "utf8");
    } catch {
      // ignore so just creates file
    }
    const sideEffectResult = await sideEffectFunction(
      this.currentlyGeneratingTemplateFullSettings,
      oldFileContents,
    );
    if (!sideEffectResult) {
      return;
    }
    await fs.writeFile(absoluteFilePath, sideEffectResult, "utf8");
  }

  private setTemplateGenerationValues(
    userSettings: UserTemplateSettings,
    template: Template,
    parentInstanceId?: string,
  ): Result<void> {
    this.currentlyGeneratingTemplate = template;
    this.currentlyGeneratingTemplateParentInstanceId = parentInstanceId;
    return this.updateParsedUserSettingsWithParentSettings(userSettings);
  }

  private static async autoInstantiateSubTemplates(
    options: GeneratorOptions,
    template: Template,
    fullParentSettings: TemplateSettingsType<z.AnyZodObject>,
    destinationProject: Project,
    parentTemplateInstanceId: string,
  ) {
    for (const templateToAutoInstantiate of template.config.autoInstatiatedSubtemplates || []) {
      const newTemplateSettings =
        templateToAutoInstantiate.mapSettings(fullParentSettings);

      const newFullTemplateSettings = Object.assign({}, fullParentSettings, newTemplateSettings);

      const nameOfTemplateToAutoInstantiate = stringOrCallbackToString(
        templateToAutoInstantiate.subTemplateName,
        newFullTemplateSettings,
      );
      const templateToInstantiate = template.findSubTemplate(
        nameOfTemplateToAutoInstantiate,
      );

      if (templateToInstantiate) {
        const newTemplateGeneratorService = new TemplateGeneratorService(
          options,
          templateToInstantiate,
          fullParentSettings.projectName,
          destinationProject,
        );
        await newTemplateGeneratorService.instantiateTemplateInProject(
          newTemplateSettings,
          nameOfTemplateToAutoInstantiate,
          parentTemplateInstanceId,
          true,
        );

        TemplateGeneratorService.autoInstantiateSubTemplates(
          options,
          templateToInstantiate,
          newFullTemplateSettings,
          destinationProject,
          parentTemplateInstanceId,
        );
      }
    }
  }

  /**
   * Instantiates the template by copying files from the template’s directory, processing them with Handlebars,
   * and then applying any defined side effects.
   *
   * @param templateName The name of the template to instantiate.s
   * @returns The absolute path where templated files are written.
   */
  // TODO: adding ai will require some more state. Probably save to file and stream file content to frontend or something. Since we need to keep the result if connection were to close.
  public async instantiateTemplateInProject(
    userSettings: UserTemplateSettings,
    templateName: string,
    parentInstanceId?: string,
    autoInstantiated?: boolean,
    newUuid?: string,
  ): Promise<Result<string>> {
    if ((!this.destinationProject || !parentInstanceId) && this.options.mode === "traditional") {
      console.error("No destination project or parent instance ID provided.");
      return { error: "No destination project or parent instance ID provided." };
    }
    const template = this.rootTemplate.findSubTemplate(templateName);
    if (!template) {
      console.error(
        `Template ${templateName} could not be found in rootTemplate ${this.rootTemplate.config.templateConfig.name}`,
      );
      return {
        error: `Template ${templateName} could not be found in rootTemplate ${this.rootTemplate.config.templateConfig.name}`,
      };
    }

    const result = this.setTemplateGenerationValues(userSettings, template, parentInstanceId!);

    if ("error" in result) {
      console.error(`Failed to set template generation values: ${result.error}`);
      return { error: `Failed to set template generation values: ${result.error}` };
    }

    if (!this.currentlyGeneratingTemplateFullSettings) {
      console.error("Failed to parse user settings.");
      return { error: "Failed to parse user settings." };
    }

    const templatesThatDisableThisTemplate = anyOrCallbackToAny(
      template.config.templatesThatDisableThis,
      this.currentlyGeneratingTemplateFullSettings,
    );

    if (this.options.mode === "traditional") {
      for (const instantiatedTemplate of this.destinationProject!.instantiatedProjectSettings.instantiatedTemplates) {
        if (
          instantiatedTemplate.id === parentInstanceId! &&
          instantiatedTemplate.templateName === templateName &&
          !template.config.templateConfig.multiInstance
        ) {
          console.error(`Template ${templateName} is already instantiated.`);
          return { error: `Template ${templateName} is already instantiated.` };
        }
        if (
          templatesThatDisableThisTemplate?.includes(
            instantiatedTemplate.templateName,
          )
        ) {
          console.error(
            `Template ${templateName} cannot be instantiated because ${instantiatedTemplate.templateName} is already instantiated.`,
          );
          return {
            error: `Template ${templateName} cannot be instantiated because ${instantiatedTemplate.templateName} is already instantiated.`,
          };
        }
      }
    }

    const assertions = anyOrCallbackToAny(
      template.config.assertions,
      this.currentlyGeneratingTemplateFullSettings,
    );

    if (assertions !== undefined && !assertions) {
      console.error(`Template ${templateName} failed assertions.`);
      return { error: `Template ${templateName} failed assertions.` };
    }

    const parsedUserSettings = template.config.templateSettingsSchema.safeParse(userSettings);
    if (!parsedUserSettings.success) {
      console.error(
        `Failed to parse user settings: ${parsedUserSettings.error}`,
      );
      return { error: `Failed to parse user settings: ${parsedUserSettings.error}` };
    }

    try {
      await this.copyDirectory();
      await this.applySideEffects();
      if (!this.options.dontGenerateTemplateSettings) {
        const newTemplateInstanceId = await addTemplateToSettings(
          this.options.absoluteDestinationPath,
          parentInstanceId!,
          template,
          parsedUserSettings.data,
          autoInstantiated,
          newUuid,
        );

        if ("error" in newTemplateInstanceId) {
          console.error(
            `Failed to add template to settings: ${newTemplateInstanceId.error}`,
          );
          return {
            error: `Failed to add template to settings: ${newTemplateInstanceId.error}`,
          };
        }
        if (this.options.mode === "traditional") {
          await PROJECT_REGISTRY.reloadProjects();
          const destinationProject = await PROJECT_REGISTRY.findProject(this.projectName);

          if (!destinationProject) {
            console.error(
              `Failed to find project ${this.projectName} after creating it.`,
            );
            return {
              error: `Failed to find project ${this.projectName} after creating it.`,
            };
          }

        }
        await TemplateGeneratorService.autoInstantiateSubTemplates(
          this.options,
          template,
          this.currentlyGeneratingTemplateFullSettings,
          this.destinationProject!,
          newTemplateInstanceId.data,
        );
      }
    } catch (e) {
      console.error(`Failed to instantiate template: ${e}`);
      return { error: `Failed to instantiate template: ${e}` };
    }
    return { data: this.getAbsoluteTargetPath() };
  }

  /**
   * Instantiates a new project by copying the root template to the specified destination.
   * The new project is created in the specified directory.
   * @param newProjectName The name of the new project.
   * @returns The absolute path of the new project.
   * @throws Error if the project cannot be created.
   */
  // TODO think about which function to call when standalone templating. Probably the above.
  public async instantiateNewProject(userSettings: UserTemplateSettings, newUuid?: string): Promise<Result<CreateProjectResult>> {
    const dirStat = await fs
      .stat(this.options.absoluteDestinationPath)
      .catch(() => null);
    if (dirStat && dirStat.isDirectory()) {
      console.error(
        `Directory ${this.options.absoluteDestinationPath} already exists.`,
      );
      return {
        error: `Directory ${this.options.absoluteDestinationPath} already exists.`,
      };
    }

    const newProjectId = newUuid || crypto.randomUUID();

    const parsedUserSettings = this.rootTemplate.config.templateSettingsSchema.safeParse(userSettings);

    const newProjectSettings: ProjectSettings = {
      projectName: this.projectName,
      projectAuthor: parsedUserSettings.data && 'author' in parsedUserSettings.data ? parsedUserSettings.data.author as string : this.rootTemplate.config.templateConfig.author,
      rootTemplateName: this.rootTemplate.config.templateConfig.name,
      instantiatedTemplates: [
        {
          id: newProjectId,
          parentId: undefined,
          templateName: this.rootTemplate.config.templateConfig.name,
          templateSettings: parsedUserSettings.data,
        },
      ],
    };

    const result = this.setTemplateGenerationValues(userSettings, this.rootTemplate);

    if ('error' in result) {
      console.error(`Failed to set template generation values: ${result.error}`);
      return { error: `Failed to set template generation values: ${result.error}` };
    }

    if (!this.currentlyGeneratingTemplateFullSettings) {
      console.error("Failed to parse user settings.");
      return { error: "Failed to parse user settings." };
    }

    try {
      await makeDir(this.options.absoluteDestinationPath);
      if (this.options.mode === "traditional") {
        const createRepoResult = await createGitRepo(this.options.absoluteDestinationPath);
        if (!createRepoResult) {
          console.error(
            `Failed to create git repository in ${this.options.absoluteDestinationPath}`,
          );
          return {
            error: `Failed to create git repository in ${this.options.absoluteDestinationPath}`,
          };
        }
      }
      if (!this.options.dontGenerateTemplateSettings) {
        const writeSettingsResult = await writeNewProjectSettings(
          this.options.absoluteDestinationPath,
          newProjectSettings,
        );
        if ("error" in writeSettingsResult) {
          console.error(
            `Failed to write project settings: ${writeSettingsResult.error}`,
          );
          return { error: `Failed to write project settings: ${writeSettingsResult.error}` };
        }
      }
      if (this.options.mode === "traditional") {
        const commitResult = await commitAll(this.options.absoluteDestinationPath, `Initial commit for ${this.projectName}`);
        if (!commitResult) {
          console.error(
            `Failed to commit project settings: ${commitResult}`,
          );
          return { error: `Failed to commit project settings: ${commitResult}` };
        }
      }
      await this.copyDirectory();
      await this.applySideEffects();

      if (this.options.mode === "traditional") {
        await PROJECT_REGISTRY.reloadProjects();
        const destinationProject =
          await PROJECT_REGISTRY.findProject(this.projectName);

        if (!destinationProject) {
          console.error(
            `Failed to find project ${this.projectName} after creating it.`,
          );
          return {
            error: `Failed to find project ${this.projectName} after creating it.`,
          };
        }

        await TemplateGeneratorService.autoInstantiateSubTemplates(
          this.options,
          this.rootTemplate,
          this.currentlyGeneratingTemplateFullSettings,
          destinationProject,
          newProjectId,
        );
      }
    } catch (e) {
      console.error(`Failed to instantiate new project: ${e}`);
      return { error: `Failed to instantiate new project: ${e}` };
    }

    if (this.options.mode === "traditional") {
      const diffResult = await addAllAndDiff(this.options.absoluteDestinationPath);
      if (!diffResult) {
        console.error(
          `Failed to generate diff for ${this.options.absoluteDestinationPath}`,
        );
        return {
          error: `Failed to generate diff for ${this.options.absoluteDestinationPath}`,
        };
      }

      return {
        data: {
          resultPath: this.options.absoluteDestinationPath,
          diff: diffResult,
        },
      };
    }

    return { data: { resultPath: this.options.absoluteDestinationPath, diff: "" } };
  }

  public async instantiateFullProjectFromSettings(
    projectSettings: ProjectSettings
  ): Promise<Result<CreateProjectResult>> {
    if (this.options.mode !== "standalone") {
      return {
        error: "Modes other than standalone are currently not supported but will be later.",
      }
    }
    try {
      if (this.rootTemplate.config.templateConfig.name !== projectSettings.rootTemplateName) {
        return { error: "Root template name mismatch in project settings." };
      }

      if (projectSettings.instantiatedTemplates.length === 0) {
        return { error: "No instantiated templates found in project settings." };
      }

      const mainGenerator = new TemplateGeneratorService(this.options, this.rootTemplate, this.projectName);
      const projectGenerationResult = await mainGenerator.instantiateNewProject(projectSettings.instantiatedTemplates[0]!.templateSettings, projectSettings.instantiatedTemplates[0]!.id);

      if ("error" in projectGenerationResult) {
        return { error: `Failed to instantiate project: ${projectGenerationResult.error}` };
      }

      for (const instantiated of projectSettings.instantiatedTemplates) {
        const subTemplate = this.rootTemplate.findSubTemplate(instantiated.templateName);
        if (!subTemplate) {
          console.error(`Subtemplate ${instantiated.templateName} not found. Skipping...`);
          continue;
        }

        const subGenerator = new TemplateGeneratorService(
          this.options,
          subTemplate,
          this.projectName
        );

        const res = await subGenerator.instantiateTemplateInProject(instantiated.templateSettings, instantiated.templateName, instantiated.parentId || "", false, instantiated.id);
        if ("error" in res) {
          console.error(`Error instantiating template ${instantiated.templateName}: ${res.error}`);
        }
      }
      return { data: { resultPath: this.options.absoluteDestinationPath, diff: "" } };
    } catch (e) {
      return { error: `Failed to instantiate full project from settings: ${e}` };
    }
  }

}

