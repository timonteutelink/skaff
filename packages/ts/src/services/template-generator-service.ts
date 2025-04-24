import {
  AllowOverwrite,
  AutoInstantiatedSubtemplate,
  RedirectFile,
  SideEffectFunction,
  TemplateSettingsType,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import fs from "fs-extra";
import { glob } from "glob";
import Handlebars, { HelperOptions } from 'handlebars';
import * as path from "node:path";
import z from "zod";
import { Template } from "../models/template-models";
import {
  anyOrCallbackToAny,
  isSubset,
  stringOrCallbackToString,
} from "../utils/shared-utils";
import { CreateProjectResult, ProjectSettings, Result } from "../utils/types";
import { makeDir } from "./file-service";
import { addAllAndDiff, commitAll, createGitRepo } from "./git-service";
import { getParsedUserSettingsWithParentSettings } from "./project-service";
import {
  writeNewProjectSettings,
  writeNewTemplateToSettings,
} from "./project-settings-service";

const eqHelper = (a: any, b: any, options?: HelperOptions) => {
  // block form: options.fn is a function
  if (options && typeof options.fn === 'function') {
    return a === b ? options.fn(this) : options.inverse(this);
  }
  // inline/subexpression form: just return the boolean
  return a === b;
}

Handlebars.registerHelper(
  'eq',
  eqHelper
);

const snakeCaseHelper = (str: string) => {
  return str?.replace("-", "_")
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/\s+/g, '_')
    .toLowerCase();
}

Handlebars.registerHelper(
  'snakeCase',
  snakeCaseHelper
);

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
  dontAutoInstantiate?: boolean;

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

  private getRedirects(): Result<RedirectFile[]> {
    if (
      !this.currentlyGeneratingTemplate ||
      !this.currentlyGeneratingTemplateFullSettings
    ) {
      return { error: "No template is currently being generated." };
    }
    const fullSettings = this.currentlyGeneratingTemplateFullSettings;
    const redirects = anyOrCallbackToAny(this.currentlyGeneratingTemplate.config.redirects, fullSettings);
    if ("error" in redirects) {
      console.error(`Failed to parse redirects: ${redirects.error}`);
      return { error: `Failed to parse redirects: ${redirects.error}` };
    }
    if (!redirects.data) {
      return { data: [] };
    }

    return { data: redirects.data };
  }


  private getOverwrites(): Result<AllowOverwrite[]> {
    if (
      !this.currentlyGeneratingTemplate ||
      !this.currentlyGeneratingTemplateFullSettings
    ) {
      return { error: "No template is currently being generated." };
    }
    const fullSettings = this.currentlyGeneratingTemplateFullSettings;
    const overwrites = anyOrCallbackToAny(this.currentlyGeneratingTemplate.config.allowedOverwrites, fullSettings);
    if ("error" in overwrites) {
      console.error(`Failed to parse overwrites: ${overwrites.error}`);
      return { error: `Failed to parse overwrites: ${overwrites.error}` };
    }
    if (!overwrites.data) {
      return { data: [] };
    }

    return { data: overwrites.data };
  }

  private getTemplatesToAutoInstantiate(): Result<AutoInstantiatedSubtemplate[]> {
    if (
      !this.currentlyGeneratingTemplate ||
      !this.currentlyGeneratingTemplateFullSettings
    ) {
      return { error: "No template is currently being generated." };
    }
    const fullSettings = this.currentlyGeneratingTemplateFullSettings;
    const templatesToAutoInstantiate = anyOrCallbackToAny(this.currentlyGeneratingTemplate.config.autoInstantiatedSubtemplates, fullSettings);
    if ("error" in templatesToAutoInstantiate) {
      console.error(`Failed to parse templatesToAutoInstantiate: ${templatesToAutoInstantiate.error}`);
      return { error: `Failed to parse templatesToAutoInstantiate: ${templatesToAutoInstantiate.error}` };
    }
    if (!templatesToAutoInstantiate.data) {
      return { data: [] };
    }

    return { data: templatesToAutoInstantiate.data };
  }

  /**
   * Copies all files from the template’s adjacent "templates" directory to the destination.
   * Files are processed with Handlebars. If a file ends in ".hbs", the extension is removed.
   */
  // TODO never use a template if commit hashes dont match
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

    const overwrites = this.getOverwrites();

    if ("error" in overwrites) {
      console.error(`Failed to parse overwrites: ${overwrites.error}`);
      return { error: `Failed to parse overwrites: ${overwrites.error}` };
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
        const srcStats = await fs.stat(srcPath);
        if (srcStats.isDirectory()) continue;

        try {
          const destStats = await fs.stat(destPath);
          if (destStats.isFile()) {
            const allowedOverwrite = overwrites.data.find((overwrite) => overwrite.srcRegex.test(entry));
            if (!allowedOverwrite || allowedOverwrite.mode === 'error') {
              console.error(`File: ${entry} at ${destPath} already exists.`);
              return { error: `File: ${entry} at ${destPath} already exists.` }
            }

            if (allowedOverwrite.mode.endsWith('warn')) {
              console.warn(`File: ${entry} at ${destPath} already exists. ${allowedOverwrite.mode.startsWith('ignore') ? 'Ignoring' : 'Overwriting'} it.`)
            }

            if (allowedOverwrite.mode.startsWith('ignore')) {
              continue;
            }
          }
        } catch { }

        const content = await fs.readFile(srcPath, "utf-8");
        const compiled = Handlebars.compile(content);
        const result = compiled(this.currentlyGeneratingTemplateFullSettings);

        await fs.ensureDir(path.dirname(destPath));
        await fs.writeFile(destPath, result, "utf-8");

        await fs.chmod(destPath, srcStats.mode);

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

    const fullSettings = this.currentlyGeneratingTemplateFullSettings;
    const sideEffects = anyOrCallbackToAny(this.currentlyGeneratingTemplate.config.sideEffects, fullSettings);
    if ("error" in sideEffects) {
      console.error(`Failed to parse side effects: ${sideEffects.error}`);
      return { error: `Failed to parse side effects: ${sideEffects.error}` };
    }

    for (const sideEffect of sideEffects.data || []) {
      const applyResult = await this.applySideEffect(
        sideEffect.filePath,
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
    templatesToAutoInstantiate?: AutoInstantiatedSubtemplate[],
  ): Promise<Result<void>> {
    if (this.options.dontAutoInstantiate) {
      return { data: undefined };
    }
    if (!this.currentlyGeneratingTemplate) {
      console.error("No template is currently being generated.");
      return { error: "No template is currently being generated." };
    }

    for (const templateToAutoInstantiate of templatesToAutoInstantiate || []) {
      const newTemplateSettings = anyOrCallbackToAny(templateToAutoInstantiate.mapSettings, fullParentSettings);

      if ("error" in newTemplateSettings) {
        console.error(
          `Failed to parse template settings: ${newTemplateSettings.error}`,
        );
        return {
          error: `Failed to parse template settings: ${newTemplateSettings.error}`,
        };
      }

      const newFullTemplateSettings = Object.assign(
        {},
        fullParentSettings,
        newTemplateSettings,
      );

      const nameOfTemplateToAutoInstantiate = templateToAutoInstantiate.subTemplateName;

      const templateToInstantiate =
        this.currentlyGeneratingTemplate.findSubTemplate(
          nameOfTemplateToAutoInstantiate,
        );

      if (!templateToInstantiate) {
        console.error(
          `Template ${nameOfTemplateToAutoInstantiate} not found in ${this.currentlyGeneratingTemplate.config.templateConfig.name}`,
        );
        return {
          error: `Template ${nameOfTemplateToAutoInstantiate} not found in ${this.currentlyGeneratingTemplate.config.templateConfig.name}`,
        };
      }

      if (!templateToInstantiate.parentTemplate || templateToInstantiate.parentTemplate.config.templateConfig.name !== this.currentlyGeneratingTemplate.config.templateConfig.name) {
        console.error(
          `Subtemplate ${templateToAutoInstantiate.subTemplateName} is not a child of template ${this.currentlyGeneratingTemplate.config.templateConfig.name}`,
        );
        return {
          error: `Subtemplate ${templateToAutoInstantiate.subTemplateName} is not a child of template ${this.currentlyGeneratingTemplate.config.templateConfig.name}`,
        };
      }

      const addTemplateResult = this.addNewTemplate(
        newTemplateSettings.data,
        nameOfTemplateToAutoInstantiate,
        parentTemplateInstanceId,
        true,
      );

      if ("error" in addTemplateResult) {
        console.error(
          `Failed to add template to project settings: ${addTemplateResult.error}`,
        );
        return {
          error: `Failed to add template to project settings: ${addTemplateResult.error}`,
        };
      }

      const savedCurrentlyGeneratingTemplate: Template =
        this.currentlyGeneratingTemplate;
      const savedCurrentlyGeneratingTemplateFullSettings =
        this.currentlyGeneratingTemplateFullSettings;
      const savedCurrentlyGeneratingTemplateParentInstanceId =
        this.currentlyGeneratingTemplateParentInstanceId;

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

      const childrenTemplatesToAutoInstantiate = templateToAutoInstantiate.children;

      if (childrenTemplatesToAutoInstantiate) {
        const autoInstantiationResult = await this.autoInstantiateSubTemplates(
          newFullTemplateSettings,
          addTemplateResult.data,
          childrenTemplatesToAutoInstantiate,
        );

        if ("error" in autoInstantiationResult) {
          this.currentlyGeneratingTemplate = savedCurrentlyGeneratingTemplate;
          this.currentlyGeneratingTemplateFullSettings =
            savedCurrentlyGeneratingTemplateFullSettings;
          this.currentlyGeneratingTemplateParentInstanceId =
            savedCurrentlyGeneratingTemplateParentInstanceId;
          console.error(
            `Failed to auto-instantiate children subtemplates: ${autoInstantiationResult.error}`,
          );
          return {
            error: `Failed to auto-instantiate children subtemplates: ${autoInstantiationResult.error}`,
          };
        }
      }

      const templatesToAutoInstantiate = this.getTemplatesToAutoInstantiate();

      if ("error" in templatesToAutoInstantiate) {
        this.currentlyGeneratingTemplate = savedCurrentlyGeneratingTemplate;
        this.currentlyGeneratingTemplateFullSettings =
          savedCurrentlyGeneratingTemplateFullSettings;
        this.currentlyGeneratingTemplateParentInstanceId =
          savedCurrentlyGeneratingTemplateParentInstanceId;
        console.error(
          `Failed to parse auto instantiated subtemplates: ${templatesToAutoInstantiate.error}`,
        );
        return {
          error: `Failed to parse auto instantiated subtemplates: ${templatesToAutoInstantiate.error}`,
        };
      }

      const autoInstantiationResult = await this.autoInstantiateSubTemplates(
        newFullTemplateSettings,
        parentTemplateInstanceId,
        templatesToAutoInstantiate.data,
      );

      if ("error" in autoInstantiationResult) {
        this.currentlyGeneratingTemplate = savedCurrentlyGeneratingTemplate;
        this.currentlyGeneratingTemplateFullSettings =
          savedCurrentlyGeneratingTemplateFullSettings;
        this.currentlyGeneratingTemplateParentInstanceId =
          savedCurrentlyGeneratingTemplateParentInstanceId;
        console.error(
          `Failed to auto-instantiate subtemplates: ${autoInstantiationResult.error}`,
        );
        return {
          error: `Failed to auto-instantiate subtemplates: ${autoInstantiationResult.error}`,
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
      templateCommitHash: this.rootTemplate.commitHash,
      templateName: this.rootTemplate.config.templateConfig.name,
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
      templateCommitHash: template.commitHash,
      automaticallyInstantiatedByParent: autoInstantiated,
      templateName,
      templateSettings: parsedUserSettings.data,
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
    // TODO: disable every other action in project page when the commithash is not equal.
    // NO actually just make sure always before generating to git checkout the right template. I guess before every generation/copydirectory we need to git checkout the right commit hash, load the template again from this the newly checked out template. Run the generation and git checkout the old branch again. This needs to happen for every generation but also when displaying the template.
    // NO maybe we will NEED to make another copy of the templates dir and checkout there so we can just retrieve templates and get all versions not only the newest. So when retrieving projects if there is a oldtemplatehash used anywhere we call a function to copy the template dir to cache. There we checkout this commit hash and we load it from there. This way we can also display the other revisions of template in frontend on templates list since they will have been added. Then we can make it so the apps requires restart if you change and recommit the templates dir because before that all templates will be loaded in memory with a commit hash and will never be loaded again. So add checks everywhere if commit hash still the same and if git dir is clean before actually generating the template. So now to uniquely identify template should use everywhere name and commit hash and when searching template you have the newest one and then all revisions used for projects. Probaly store the copied revisions in the cachedir inside a dir with the commithash as name. This way we in generation we can reference files from any revision directly to use old and new templates and also to update from old to new template. When app starts and projects are loaded will check if revisions in cache else copy dir there and checkout right revision. Add error TEMPLATE DIR CHANGED and a button to manually reload all templates and then revisions and will delete all cached revisions. This way no restart of app is needed. So the registry will fill up with revisions while app is running and when user press reload will clean and load again.
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
        templatesThatDisableThisTemplate.data?.filter(templateThatDisableThis => !templateThatDisableThis.specificSettings || isSubset(templateThatDisableThis.specificSettings, instantiatedTemplate.templateSettings)).map(templateThatDisableThis => templateThatDisableThis.templateName).includes(
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

      const templatesToAutoInstantiate = this.getTemplatesToAutoInstantiate();

      if ("error" in templatesToAutoInstantiate) {
        console.error(
          `Failed to parse auto instantiated subtemplates: ${templatesToAutoInstantiate.error}`,
        );
        return {
          error: `Failed to parse auto instantiated subtemplates: ${templatesToAutoInstantiate.error}`,
        };
      }

      const result = await this.autoInstantiateSubTemplates(
        this.currentlyGeneratingTemplateFullSettings,
        instantiatedTemplate.id,
        templatesToAutoInstantiate.data,
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

      // TODO: Revise this to be able to be called recursively so add this as a param to function and use getTemplatesToAutoInstantiate. Then call this function on the children list.
      // maybe later we make sure adding every template to the projectSettings happens in the first step and then the instantiateTemplateInProject and instantiateNewProject functions can call this function which will retrieve everything from projectsettings which were already set before calling instantiateTemplateInProject and instantiateNewProject. So 2 seperate steps. Modify the templateSettings and then generate. HEre also force template to be direct child of currentlyGeneratingTemplate
      const templatesToAutoInstantiate = this.getTemplatesToAutoInstantiate();

      if ("error" in templatesToAutoInstantiate) {
        console.error(
          `Failed to parse auto instantiated subtemplates: ${templatesToAutoInstantiate.error}`,
        );
        return {
          error: `Failed to parse auto instantiated subtemplates: ${templatesToAutoInstantiate.error}`,
        };
      }
      const result = await this.autoInstantiateSubTemplates(
        this.currentlyGeneratingTemplateFullSettings,
        instantiatedTemplate.id,
        templatesToAutoInstantiate.data,
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
      console.error(
        "Please make sure child templates are not autoinstantiated before generating a full project from existing settings.",
      );
      return {
        error:
          "Please make sure child templates are not autoinstantiated before generating a full project from existing settings.",
      };
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
