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
   * The absolute path to the destination directory where the template will be generated.
   * Should be the root project dir or the directory where the individual template should be stored.
   * This should be a valid path on the filesystem.
   */
  absoluteDestinationPath: string;
}

export class TemplateGeneratorService {
  public options: GeneratorOptions;
  public destinationProject?: Project;
  public rootTemplate: Template;

  // Values set when generating a template. Should always be set again before generating a new template.
  private currentlyGeneratingTemplate?: Template;
  private currentlyGeneratingTemplateParentInstanceId?: string;
  private currentlyGeneratingTemplateFullSettings?: TemplateSettingsType<z.AnyZodObject>;

  constructor(
    options: GeneratorOptions,
    rootTemplate: Template,
    destinationProject?: Project,
  ) {
    this.options = options;
    this.destinationProject = destinationProject;
    this.rootTemplate = rootTemplate.findRootTemplate();
  }

  private updateParsedUserSettingsWithParentSettings(userSettings: UserTemplateSettings): void {
    const parsedUserSettings = this.currentlyGeneratingTemplate?.config.templateSettingsSchema.safeParse(userSettings);
    if (!parsedUserSettings?.success) {
      console.error(
        `Failed to parse user settings: ${parsedUserSettings?.error}`,
      );
      return;
    }
    let newUserSettings: TemplateSettingsType<z.AnyZodObject> = parsedUserSettings.data as TemplateSettingsType<z.AnyZodObject>;
    if (this.destinationProject) {
      newUserSettings = {
        ...newUserSettings,
        project_name:
          this.destinationProject.instantiatedProjectSettings.projectName,
      };
      if (
        this.currentlyGeneratingTemplate?.parentTemplate &&
        this.currentlyGeneratingTemplateParentInstanceId
      ) {
        newUserSettings = {
          ...newUserSettings,
          ...this.destinationProject.getInstantiatedSettings(
            this.currentlyGeneratingTemplate.parentTemplate,
            this.currentlyGeneratingTemplateParentInstanceId,
          ),
        };
      }
    } else {
      newUserSettings = {
        ...newUserSettings,
        project_name: path.basename(this.options.absoluteDestinationPath),
      };
    }
    this.currentlyGeneratingTemplateFullSettings = newUserSettings;
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

    await fs.mkdir(dest, { recursive: true });

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
  ) {
    this.currentlyGeneratingTemplate = template;
    this.currentlyGeneratingTemplateParentInstanceId = parentInstanceId;
    this.updateParsedUserSettingsWithParentSettings(userSettings);
  }

  private static async autoInstantiateSubTemplates(
    options: GeneratorOptions,
    template: Template,
    fullParentSettings: TemplateSettingsType<z.AnyZodObject>,
    destinationProject: Project,
    newProjectId: string,
  ) {
    if (!template.config.autoInstatiatedSubtemplates) {
      return;
    }
    for (const templateToAutoInstantiate of template.config
      .autoInstatiatedSubtemplates) {
      const nameOfTemplateToAutoInstantiate = stringOrCallbackToString(
        templateToAutoInstantiate.subTemplateName,
        fullParentSettings,
      );
      const newTemplateSettings =
        templateToAutoInstantiate.mapSettings(fullParentSettings);
      const templateToInstantiate = template.findSubTemplate(
        nameOfTemplateToAutoInstantiate,
      );

      if (templateToInstantiate) {
        const newTemplateGeneratorService = new TemplateGeneratorService(
          options,
          templateToInstantiate,
          destinationProject,
        );
        await newTemplateGeneratorService.instantiateTemplateInProject(
          newTemplateSettings,
          nameOfTemplateToAutoInstantiate,
          newProjectId,
          true,
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
  // TODO: add git. if autoInstanted ignore git because will happen after parent calls this
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

    const projectName = this.options.mode === "traditional"
      ? this.destinationProject!.instantiatedProjectSettings.projectName
      : path.basename(this.options.absoluteDestinationPath);

    this.setTemplateGenerationValues(userSettings, template, parentInstanceId!);

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
      if (this.options.mode === "traditional") {
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

        await PROJECT_REGISTRY.reloadProjects();
        const destinationProject = await PROJECT_REGISTRY.findProject(projectName);

        if (!destinationProject) {
          console.error(
            `Failed to find project ${projectName} after creating it.`,
          );
          return {
            error: `Failed to find project ${projectName} after creating it.`,
          };
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

    const projectName = path.basename(this.options.absoluteDestinationPath);

    const newProjectId = newUuid || crypto.randomUUID();

    const parsedUserSettings = this.rootTemplate.config.templateSettingsSchema.safeParse(userSettings);

    const newProjectSettings: ProjectSettings = {
      projectName,
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

    this.setTemplateGenerationValues(userSettings, this.rootTemplate);

    if (!this.currentlyGeneratingTemplateFullSettings) {
      console.error("Failed to parse user settings.");
      return { error: "Failed to parse user settings." };
    }

    try {
      await fs.mkdir(this.options.absoluteDestinationPath, { recursive: true });
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
        const commitResult = await commitAll(this.options.absoluteDestinationPath, `Initial commit for ${projectName}`);
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
          await PROJECT_REGISTRY.findProject(projectName);

        if (!destinationProject) {
          console.error(
            `Failed to find project ${projectName} after creating it.`,
          );
          return {
            error: `Failed to find project ${projectName} after creating it.`,
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

      await fs.mkdir(this.options.absoluteDestinationPath, { recursive: true });

      for (const instantiated of projectSettings.instantiatedTemplates) {
        const subTemplate = this.rootTemplate.findSubTemplate(instantiated.templateName);
        if (!subTemplate) {
          console.error(`Subtemplate ${instantiated.templateName} not found. Skipping...`);
          continue;
        }

        // no project tracking in standalone mode
        const subGenerator = new TemplateGeneratorService(
          this.options,
          subTemplate,
        );

        // Use an empty string or the parent instance id if applicable.
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

