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
import { addAllAndDiff, commitAll, createGitRepo } from "./git-service";
import {
  writeNewProjectSettings,
  writeNewTemplateToSettings,
} from "./project-settings-service";
import { getParsedUserSettingsWithParentSettings } from "./project-service";
import { makeDir } from "./file-service";

export interface GeneratorOptions {
  /**
   * Don't add git.
   */
  dontDoGit?: boolean;

  /**
   * If true, the template generator will not generate the template settings file.
   * This mode allows subtemplates to be generated but will never save the template setttings so after generation is complete all settings are lost.
   */
  dontGenerateTemplateSettings?: boolean;

  /**
   * If true do not auto instantiate child templates. Ignores this field.
   */
  dontAutoInstantiate?: boolean

  /**
   * The absolute path to the destination directory where the template will be generated.
   * Should be the root project dir or the directory where the individual template should be stored.
   * This should be a valid path on the filesystem.
   */
  absoluteDestinationPath: string;
}

// TODO refactor to store project settings. Initially when constructor gets called we pass all ProjectSettings which are already instantiated. Then when instantiating new template will add itself to the projectsettings. This way we can also reuse this object to generate multiple template.
export class TemplateGeneratorService {
  public options: GeneratorOptions;
  public destinationProjectSettings: ProjectSettings;
  public rootTemplate: Template;

  // Values set when generating a template. Should always be set again before generating a new template.
  private currentlyGeneratingTemplate?: Template;
  private currentlyGeneratingTemplateParentInstanceId?: string;
  private currentlyGeneratingTemplateFullSettings?: TemplateSettingsType<z.AnyZodObject>;

  constructor(
    options: GeneratorOptions,
    rootTemplate: Template,
    destinationProjectSettings: ProjectSettings,
  ) {
    this.options = options;
    this.rootTemplate = rootTemplate.findRootTemplate();
    this.destinationProjectSettings = destinationProjectSettings;
  }

  private updateParsedUserSettingsWithAllParentSettings(
    userSettings: UserTemplateSettings,
  ): Result<void> {
    if (!this.currentlyGeneratingTemplate) {
      console.error("No template is currently being generated.");
      return { error: "No template is currently being generated." };
    }
    const result = getParsedUserSettingsWithParentSettings(
      userSettings,
      this.currentlyGeneratingTemplate,
      this.destinationProjectSettings,
      this.currentlyGeneratingTemplateParentInstanceId,
    );

    if ("error" in result) {
      console.error(`Failed to parse user settings: ${result.error}`);
      return { error: `Failed to parse user settings: ${result.error}` };
    }

    this.currentlyGeneratingTemplateFullSettings = result.data;

    return { data: undefined };
  }

  private getTargetPath(): Result<string> {
    if (
      !this.currentlyGeneratingTemplate ||
      !this.currentlyGeneratingTemplateFullSettings
    ) {
      console.error("No template is currently being generated.");
      return { error: "No template is currently being generated." };
    }
    const targetPath = this.currentlyGeneratingTemplate.config.targetPath;
    if (!targetPath) {
      return { data: "." };
    }
    const path = stringOrCallbackToString(
      targetPath,
      this.currentlyGeneratingTemplateFullSettings,
    );
    if ("error" in path) {
      console.error(`Failed to parse target path: ${path.error}`);
      return { error: `Failed to parse target path: ${path.error}` };
    }
    return { data: path.data };
  }

  private getAbsoluteTargetPath(): Result<string> {
    const pathResult = this.getTargetPath();

    if ("error" in pathResult) {
      console.error(`Failed to parse target path: ${pathResult.error}`);
      return { error: `Failed to parse target path: ${pathResult.error}` };
    }

    return {
      data: path.join(this.options.absoluteDestinationPath, pathResult.data),
    };
  }

  private getRedirects(): Result<{ from: string; to: string }[]> {
    if (
      !this.currentlyGeneratingTemplate ||
      !this.currentlyGeneratingTemplateFullSettings
    ) {
      return { error: "No template is currently being generated." };
    }
    const redirects = this.currentlyGeneratingTemplate.config.redirects;
    const fullSettings = this.currentlyGeneratingTemplateFullSettings;
    if (!redirects) {
      return { data: [] };
    }

    const result = [];

    for (const redirect of redirects) {
      const from = stringOrCallbackToString(redirect.from, fullSettings);
      const to = stringOrCallbackToString(redirect.to, fullSettings);

      if ("error" in from) {
        return { error: `Failed to parse redirect from: ${from.error}` };
      }
      if ("error" in to) {
        return { error: `Failed to parse redirect to: ${to.error}` };
      }

      result.push({ from: from.data, to: to.data });
    }
    return { data: result };
  }

  /**
   * Copies all files from the template’s adjacent "templates" directory to the destination.
   * Files are processed with Handlebars. If a file ends in ".hbs", the extension is removed.
   */
  private async copyDirectory(): Promise<Result<void>> {
    if (!this.currentlyGeneratingTemplate) {
      console.error("No template is currently being generated.");
      return { error: "No template is currently being generated." };
    }

    const src = this.currentlyGeneratingTemplate.absoluteTemplatesDir;

    const dest = this.getAbsoluteTargetPath();

    if ("error" in dest) {
      console.error(`Failed to parse target path: ${dest.error}`);
      return { error: `Failed to parse target path: ${dest.error}` };
    }

    const redirects = this.getRedirects();

    if ("error" in redirects) {
      console.error(`Failed to parse redirects: ${redirects.error}`);
      return { error: `Failed to parse redirects: ${redirects.error}` };
    }

    await makeDir(dest.data);

    const entries = await glob(`**/*`, { cwd: src, dot: true, nodir: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      let destPath = path.join(dest.data, entry);

      if (destPath.endsWith(".hbs")) {
        destPath = destPath.slice(0, -4);
      }

      for (const redirect of redirects.data) {
        if (destPath.endsWith(redirect.from)) {
          destPath = path.join(dest.data, redirect.to);
          break;
        }
      }

      try {
        const stats = await fs.stat(srcPath);
        if (stats.isDirectory()) continue;

        const content = await fs.readFile(srcPath, "utf-8");
        const compiled = Handlebars.compile(content);
        const result = compiled(this.currentlyGeneratingTemplateFullSettings);

        await fs.ensureDir(path.dirname(destPath));
        await fs.writeFile(destPath, result, "utf-8");

        console.log(`Generated: ${destPath}`);
      } catch (error) {
        console.error(`Error processing file ${srcPath}: ${error}`);
        return {
          error: `Error processing file ${srcPath}: ${error}`,
        };
      }
    }

    return { data: undefined };
  }

  /**
   * Applies side effects defined in the template configuration.
   */
  private async applySideEffects(): Promise<Result<void>> {
    if (
      !this.currentlyGeneratingTemplate ||
      !this.currentlyGeneratingTemplateFullSettings
    ) {
      console.error("No template is currently being generated.");
      return { error: "No template is currently being generated." };
    }

    const sideEffects = this.currentlyGeneratingTemplate.config.sideEffects;
    const fullSettings = this.currentlyGeneratingTemplateFullSettings;

    for (const sideEffect of sideEffects || []) {
      const filePath = stringOrCallbackToString(
        sideEffect.filePath,
        fullSettings,
      );
      if ("error" in filePath) {
        console.error(`Failed to parse file path: ${filePath.error}`);
        return {
          error: `Failed to parse file path: ${filePath.error}`,
        };
      }
      const applyResult = await this.applySideEffect(
        filePath.data,
        sideEffect.apply,
      );

      if ("error" in applyResult) {
        console.error(`Failed to apply side effect: ${applyResult.error}`);
        return {
          error: `Failed to apply side effect: ${applyResult.error}`,
        };
      }
    }

    return { data: undefined };
  }

  /**
   * Reads the target file, applies the side effect function using Handlebars templating data, and writes the new content.
   */
  private async applySideEffect(
    filePath: string,
    sideEffectFunction: SideEffectFunction,
  ): Promise<Result<void>> {
    if (
      !this.currentlyGeneratingTemplate ||
      !this.currentlyGeneratingTemplateFullSettings
    ) {
      console.error("No template is currently being generated.");
      return { error: "No template is currently being generated." };
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

    let sideEffectResult;
    try {
      sideEffectResult = await sideEffectFunction(
        this.currentlyGeneratingTemplateFullSettings,
        oldFileContents,
      );
    } catch (e) {
      console.error(`Failed to apply side effect: ${e}`);
      return { error: `Failed to apply side effect: ${e}` };
    }

    try {
      await fs.writeFile(absoluteFilePath, sideEffectResult, "utf8");
    } catch (e) {
      console.error(`Failed to write file: ${e}`);
      return { error: `Failed to write file: ${e}` };
    }

    return { data: undefined };
  }

  private setTemplateGenerationValues(
    userSettings: UserTemplateSettings,
    template: Template,
    parentInstanceId?: string,
  ): Result<void> {
    this.currentlyGeneratingTemplate = template;
    this.currentlyGeneratingTemplateParentInstanceId = parentInstanceId;
    return this.updateParsedUserSettingsWithAllParentSettings(userSettings);
  }

  private async autoInstantiateSubTemplates(
    fullParentSettings: TemplateSettingsType<z.AnyZodObject>,
    parentTemplateInstanceId: string,
  ): Promise<Result<void>> {
    if (this.options.dontAutoInstantiate) {
      return { data: undefined };
    }
    if (!this.currentlyGeneratingTemplate) {
      console.error("No template is currently being generated.");
      return { error: "No template is currently being generated." };
    }
    for (const templateToAutoInstantiate of this.currentlyGeneratingTemplate
      .config.autoInstatiatedSubtemplates || []) {
      let newTemplateSettings: UserTemplateSettings;
      try {
        newTemplateSettings =
          templateToAutoInstantiate.mapSettings(fullParentSettings);
      } catch (e) {
        console.error(`Failed to parse template settings: ${e}`);
        return {
          error: `Failed to parse template settings: ${e}`,
        };
      }

      const newFullTemplateSettings = Object.assign(
        {},
        fullParentSettings,
        newTemplateSettings,
      );

      const nameOfTemplateToAutoInstantiate = stringOrCallbackToString(
        templateToAutoInstantiate.subTemplateName,
        newFullTemplateSettings,
      );

      if ("error" in nameOfTemplateToAutoInstantiate) {
        console.error(
          `Failed to parse template name: ${nameOfTemplateToAutoInstantiate.error}`,
        );
        return {
          error: `Failed to parse template name: ${nameOfTemplateToAutoInstantiate.error}`,
        };
      }

      const templateToInstantiate =
        this.currentlyGeneratingTemplate.findSubTemplate(
          nameOfTemplateToAutoInstantiate.data,
        );

      if (!templateToInstantiate) {
        console.error(
          `Template ${nameOfTemplateToAutoInstantiate} not found in ${this.currentlyGeneratingTemplate.config.templateConfig.name}`,
        );
        return {
          error: `Template ${nameOfTemplateToAutoInstantiate} not found in ${this.currentlyGeneratingTemplate.config.templateConfig.name}`,
        };
      }

      const savedCurrentlyGeneratingTemplate: Template =
        this.currentlyGeneratingTemplate;
      const savedCurrentlyGeneratingTemplateFullSettings =
        this.currentlyGeneratingTemplateFullSettings;
      const savedCurrentlyGeneratingTemplateParentInstanceId =
        this.currentlyGeneratingTemplateParentInstanceId;

      const addTemplateResult = this.addNewTemplate(
        newTemplateSettings,
        nameOfTemplateToAutoInstantiate.data,
        parentTemplateInstanceId,
      );

      if ("error" in addTemplateResult) {
        this.currentlyGeneratingTemplate = savedCurrentlyGeneratingTemplate;
        this.currentlyGeneratingTemplateFullSettings =
          savedCurrentlyGeneratingTemplateFullSettings;
        this.currentlyGeneratingTemplateParentInstanceId =
          savedCurrentlyGeneratingTemplateParentInstanceId;
        console.error(
          `Failed to add template to project settings: ${addTemplateResult.error}`,
        );
        return {
          error: `Failed to add template to project settings: ${addTemplateResult.error}`,
        };
      }

      const instantiateTemplateResult = await this.instantiateTemplateInProject(
        addTemplateResult.data,
      );

      if ("error" in instantiateTemplateResult) {
        this.currentlyGeneratingTemplate = savedCurrentlyGeneratingTemplate;
        this.currentlyGeneratingTemplateFullSettings =
          savedCurrentlyGeneratingTemplateFullSettings;
        this.currentlyGeneratingTemplateParentInstanceId =
          savedCurrentlyGeneratingTemplateParentInstanceId;
        console.error(
          `Failed to instantiate template: ${instantiateTemplateResult.error}`,
        );
        return {
          error: `Failed to instantiate template: ${instantiateTemplateResult.error}`,
        };
      }

      const autoInstatiationResult = await this.autoInstantiateSubTemplates(
        newFullTemplateSettings,
        parentTemplateInstanceId,
      );

      if ("error" in autoInstatiationResult) {
        this.currentlyGeneratingTemplate = savedCurrentlyGeneratingTemplate;
        this.currentlyGeneratingTemplateFullSettings =
          savedCurrentlyGeneratingTemplateFullSettings;
        this.currentlyGeneratingTemplateParentInstanceId =
          savedCurrentlyGeneratingTemplateParentInstanceId;
        console.error(
          `Failed to auto-instantiate subtemplates: ${autoInstatiationResult.error}`,
        );
        return {
          error: `Failed to auto-instantiate subtemplates: ${autoInstatiationResult.error}`,
        };
      }

      this.currentlyGeneratingTemplate = savedCurrentlyGeneratingTemplate;
      this.currentlyGeneratingTemplateFullSettings =
        savedCurrentlyGeneratingTemplateFullSettings;
      this.currentlyGeneratingTemplateParentInstanceId =
        savedCurrentlyGeneratingTemplateParentInstanceId;
    }

    return { data: undefined };
  }

  /**
   * These functions are only used to modify the projectSettings. Then afterwards you can call the instantiateNewProject or instantiateTemplateInProject with the id of the template to initiate.
   */
  public addNewProject(
    userSettings: UserTemplateSettings,
    newUuid?: string,
  ): Result<string> {
    if (this.destinationProjectSettings.instantiatedTemplates.length > 0) {
      console.error(
        `Project ${this.destinationProjectSettings.projectName} already has instantiated templates.`,
      );
      return {
        error: `Project ${this.destinationProjectSettings.projectName} already has instantiated templates.`,
      };
    }

    const parsedUserSettings =
      this.rootTemplate.config.templateSettingsSchema.safeParse(userSettings);
    if (!parsedUserSettings.success) {
      console.error(
        `Failed to parse user settings: ${parsedUserSettings.error}`,
      );
      return {
        error: `Failed to parse user settings: ${parsedUserSettings.error}`,
      };
    }

    const newProjectId = newUuid || crypto.randomUUID();

    this.destinationProjectSettings.instantiatedTemplates.push({
      id: newProjectId,
      parentId: undefined,
      templateName: this.rootTemplate.config.templateConfig.name,
      templateCommitHash: this.rootTemplate.commitHash,
      templateSettings: parsedUserSettings.data,
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
      console.error(
        `Template ${templateName} could not be found in rootTemplate ${this.rootTemplate.config.templateConfig.name}`,
      );
      return {
        error: `Template ${templateName} could not be found in rootTemplate ${this.rootTemplate.config.templateConfig.name}`,
      };
    }

    const parsedUserSettings =
      template.config.templateSettingsSchema.safeParse(userSettings);
    if (!parsedUserSettings.success) {
      console.error(
        `Failed to parse user settings: ${parsedUserSettings.error}`,
      );
      return {
        error: `Failed to parse user settings: ${parsedUserSettings.error}`,
      };
    }

    for (const instantiatedTemplate of this.destinationProjectSettings
      .instantiatedTemplates) {
      if (
        instantiatedTemplate.id === parentInstanceId &&
        instantiatedTemplate.templateName === templateName &&
        !template.config.templateConfig.multiInstance
      ) {
        console.error(`Template ${templateName} is already instantiated.`);
        return { error: `Template ${templateName} is already instantiated.` };
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

    this.destinationProjectSettings.instantiatedTemplates.push({
      id: newProjectId,
      parentId: parentInstanceId,
      templateName,
      templateCommitHash: template.commitHash,
      templateSettings: parsedUserSettings.data,
      automaticallyInstantiatedByParent: autoInstantiated,
    });

    return { data: newProjectId };
  }

  /**
   * Will add the templateSettings to the projectSettings.
   *
   * @param templateName The name of the template to instantiate.s
   * @returns The absolute path where templated files are written.
   */
  // TODO: adding ai will require some more state. Probably save to file and stream file content to frontend or something. Since we need to keep the result if connection were to close.
  public async instantiateTemplateInProject(
    newTemplateInstanceId: string,
  ): Promise<Result<string>> {
    const instantiatedTemplate =
      this.destinationProjectSettings.instantiatedTemplates.find(
        (template) => template.id === newTemplateInstanceId,
      );

    if (!instantiatedTemplate) {
      console.error(`Template with id ${newTemplateInstanceId} not found.`);
      return { error: `Template with id ${newTemplateInstanceId} not found.` };
    }

    const templateName = instantiatedTemplate.templateName;
    const userSettings = instantiatedTemplate.templateSettings;
    const parentInstanceId = instantiatedTemplate.parentId;

    if (!parentInstanceId) {
      console.error(
        `Parent instance ID is required for template ${templateName}. Maybe you are trying to instantiate the root template?`,
      );
      return {
        error: `Parent instance ID is required for template ${templateName}. Maybe you are trying to instantiate the root template?`,
      };
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

    const result = this.setTemplateGenerationValues(
      userSettings,
      template,
      parentInstanceId,
    );

    if ("error" in result) {
      console.error(
        `Failed to set template generation values: ${result.error}`,
      );
      return {
        error: `Failed to set template generation values: ${result.error}`,
      };
    }

    if (!this.currentlyGeneratingTemplateFullSettings) {
      console.error("Failed to parse user settings.");
      return { error: "Failed to parse user settings." };
    }

    const templatesThatDisableThisTemplate = anyOrCallbackToAny(
      template.config.templatesThatDisableThis,
      this.currentlyGeneratingTemplateFullSettings,
    );

    if ("error" in templatesThatDisableThisTemplate) {
      console.error(
        `Failed to parse templates that disable this template: ${templatesThatDisableThisTemplate.error}`,
      );
      return {
        error: `Failed to parse templates that disable this template: ${templatesThatDisableThisTemplate.error}`,
      };
    }

    for (const instantiatedTemplate of this.destinationProjectSettings
      .instantiatedTemplates) {
      if (
        templatesThatDisableThisTemplate.data?.includes(
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

    const assertions = anyOrCallbackToAny(
      template.config.assertions,
      this.currentlyGeneratingTemplateFullSettings,
    );

    if ("error" in assertions) {
      console.error(`Failed to parse assertions: ${assertions.error}`);
      return {
        error: `Failed to parse assertions: ${assertions.error}`,
      };
    }

    if (assertions.data !== undefined && !assertions.data) {
      console.error(`Template ${templateName} failed assertions.`);
      return { error: `Template ${templateName} failed assertions.` };
    }

    try {
      const copyResult = await this.copyDirectory();
      if ("error" in copyResult) {
        console.error(`Failed to copy directory: ${copyResult.error}`);
        return { error: `Failed to copy directory: ${copyResult.error}` };
      }
      const sideEffectResult = await this.applySideEffects();
      if ("error" in sideEffectResult) {
        console.error(
          `Failed to apply side effects: ${sideEffectResult.error}`,
        );
        return {
          error: `Failed to apply side effects: ${sideEffectResult.error}`,
        };
      }

      if (!this.options.dontGenerateTemplateSettings) {
        const newTemplateResult = await writeNewTemplateToSettings(
          this.options.absoluteDestinationPath,
          instantiatedTemplate,
        );

        if ("error" in newTemplateResult) {
          console.error(
            `Failed to add template to settings: ${newTemplateResult.error}`,
          );
          return {
            error: `Failed to add template to settings: ${newTemplateResult.error}`,
          };
        }
      }

      const result = await this.autoInstantiateSubTemplates(
        this.currentlyGeneratingTemplateFullSettings,
        instantiatedTemplate.id,
      );

      if ("error" in result) {
        console.error(
          `Failed to auto-instantiate subtemplates: ${result.error}`,
        );
        return {
          error: `Failed to auto-instantiate subtemplates: ${result.error}`,
        };
      }
    } catch (e) {
      console.error(`Failed to instantiate template: ${e}`);
      return { error: `Failed to instantiate template: ${e}` };
    }

    return this.getAbsoluteTargetPath();
  }

  /**
   * This function will add the template settings to the project settings.
   * @param newProjectName The name of the new project.
   * @returns The absolute path of the new project.
   * @throws Error if the project cannot be created.
   */
  public async instantiateNewProject(): Promise<Result<CreateProjectResult>> {
    const instantiatedTemplate =
      this.destinationProjectSettings.instantiatedTemplates[0];
    if (!instantiatedTemplate) {
      console.error(
        `Template with id ${this.currentlyGeneratingTemplateParentInstanceId} not found.`,
      );
      return {
        error: `Template with id ${this.currentlyGeneratingTemplateParentInstanceId} not found.`,
      };
    }

    if (
      instantiatedTemplate.templateName !==
      this.rootTemplate.config.templateConfig.name
    ) {
      console.error(
        `Root template name mismatch in project settings. Make sure root template is the first one in the list.`,
      );
      return {
        error: `Root template name mismatch in project settings. Make sure root template is the first one in the list.`,
      };
    }

    const template = this.rootTemplate;
    const userSettings = instantiatedTemplate.templateSettings;

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

    const result = this.setTemplateGenerationValues(userSettings, template);

    if ("error" in result) {
      console.error(
        `Failed to set template generation values: ${result.error}`,
      );
      return {
        error: `Failed to set template generation values: ${result.error}`,
      };
    }

    if (!this.currentlyGeneratingTemplateFullSettings) {
      console.error("Failed to parse user settings.");
      return { error: "Failed to parse user settings." };
    }

    try {
      await makeDir(this.options.absoluteDestinationPath);
      if (!this.options.dontDoGit) {
        const createRepoResult = await createGitRepo(
          this.options.absoluteDestinationPath,
        );
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
          this.destinationProjectSettings,
          false,
        );
        if ("error" in writeSettingsResult) {
          console.error(
            `Failed to write project settings: ${writeSettingsResult.error}`,
          );
          return {
            error: `Failed to write project settings: ${writeSettingsResult.error}`,
          };
        }
      }
      if (!this.options.dontDoGit) {
        const commitResult = await commitAll(
          this.options.absoluteDestinationPath,
          `Initial commit for ${this.destinationProjectSettings.projectName}`,
        );
        if (!commitResult) {
          console.error(`Failed to commit project settings: ${commitResult}`);
          return {
            error: `Failed to commit project settings: ${commitResult}`,
          };
        }
      }

      const copyResult = await this.copyDirectory();
      if ("error" in copyResult) {
        console.error(`Failed to copy directory: ${copyResult.error}`);
        return { error: `Failed to copy directory: ${copyResult.error}` };
      }

      const sideEffectResult = await this.applySideEffects();
      if ("error" in sideEffectResult) {
        console.error(
          `Failed to apply side effects: ${sideEffectResult.error}`,
        );
        return {
          error: `Failed to apply side effects: ${sideEffectResult.error}`,
        };
      }

      const result = await this.autoInstantiateSubTemplates(
        this.currentlyGeneratingTemplateFullSettings,
        instantiatedTemplate.id,
      );
      if ("error" in result) {
        console.error(
          `Failed to auto-instantiate subtemplates: ${result.error}`,
        );
        return {
          error: `Failed to auto-instantiate subtemplates: ${result.error}`,
        };
      }
    } catch (e) {
      console.error(`Failed to instantiate new project: ${e}`);
      return { error: `Failed to instantiate new project: ${e}` };
    }

    if (!this.options.dontDoGit) {
      const diffResult = await addAllAndDiff(
        this.options.absoluteDestinationPath,
      );

      if ("error" in diffResult) {
        console.error(`Failed to add all and diff: ${diffResult.error}`);
        return { error: `Failed to add all and diff: ${diffResult.error}` };
      }

      return {
        data: {
          resultPath: this.options.absoluteDestinationPath,
          diff: diffResult.data,
        },
      };
    }

    return {
      data: { resultPath: this.options.absoluteDestinationPath, diff: "" },
    };
  }

  /**
   * Will use the projectSettings to instantiate all templates defined.
   */
  public async instantiateFullProjectFromSettings(): Promise<
    Result<CreateProjectResult>
  > {
    if (!this.options.dontDoGit) {
      console.error(
        "Git is not supported for this operation. Please use the CLI.",
      );
      return {
        error: "Git is not supported for this operation. Please use the CLI.",
      };
    }

    if (!this.options.dontAutoInstantiate) {
      console.error("Please make sure child templates are not autoinstantiated before generating a full project from existing settings.")
      return { error: "Please make sure child templates are not autoinstantiated before generating a full project from existing settings." }
    }

    try {
      if (
        this.rootTemplate.config.templateConfig.name !==
        this.destinationProjectSettings.rootTemplateName
      ) {
        console.error("Root template name mismatch in project settings.");
        return { error: "Root template name mismatch in project settings." };
      }

      if (this.destinationProjectSettings.instantiatedTemplates.length === 0) {
        console.error("No instantiated templates found in project settings.");
        return {
          error: "No instantiated templates found in project settings.",
        };
      }

      const projectGenerationResult = await this.instantiateNewProject();

      if ("error" in projectGenerationResult) {
        console.error(
          `Failed to instantiate project: ${projectGenerationResult.error}`,
        );
        return {
          error: `Failed to instantiate project: ${projectGenerationResult.error}`,
        };
      }

      for (const instantiated of this.destinationProjectSettings
        .instantiatedTemplates) {
        if (
          instantiated.id ===
          this.destinationProjectSettings.instantiatedTemplates[0]!.id
        ) {
          continue;
        }
        const subTemplate = this.rootTemplate.findSubTemplate(
          instantiated.templateName,
        );
        if (!subTemplate) {
          console.error(
            `Subtemplate ${instantiated.templateName} not found. Skipping...`,
          );
          continue;
        }

        const res = await this.instantiateTemplateInProject(instantiated.id);
        if ("error" in res) {
          console.error(
            `Error instantiating template ${instantiated.templateName}: ${res.error}`,
          );
          return {
            error: `Error instantiating template ${instantiated.templateName}: ${res.error}`,
          };
        }
      }
      return {
        data: { resultPath: this.options.absoluteDestinationPath, diff: "" },
      };
    } catch (e) {
      console.error(`Failed to instantiate full project from settings: ${e}`);
      return {
        error: `Failed to instantiate full project from settings: ${e}`,
      };
    }
  }
}
