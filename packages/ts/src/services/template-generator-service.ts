import { UserTemplateSettings, SideEffectFunction, TemplateSettingsType } from '@timonteutelink/template-types-lib';
import fs from 'fs-extra';
import { glob } from 'glob';
import Handlebars from 'handlebars';
import * as path from 'node:path';
import { Template } from '../models/template-models';
import { stringOrCallbackToString } from '../utils/utils';
import { Project } from '../models/project-models';
import { ProjectSettings, Result } from '../utils/types';
import z from 'zod';

export class TemplateGeneratorService {
  public absDestinationProjectPath: string;
  public destinationProject?: Project;
  public rootTemplate: Template;
  public parsedUserSettings: UserTemplateSettings;


  // Values set when generating a template. Should always be set again before generating a new template.
  private currentlyGeneratingTemplate?: Template;
  private currentlyGeneratingTemplateParentInstanceId?: string;
  private currentlyGeneratingTemplateFullSettings?: TemplateSettingsType<z.AnyZodObject>;

  constructor(rootTemplate: Template, userSettings: UserTemplateSettings, absDestinationProjectPath: string, destinationProject?: Project) {
    this.absDestinationProjectPath = absDestinationProjectPath;
    this.destinationProject = destinationProject;
    this.rootTemplate = rootTemplate;
    this.parsedUserSettings = rootTemplate.config.templateSettingsSchema.parse(userSettings);
  }

  private updateParsedUserSettingsWithParentSettings(): void {
    let newUserSettings: TemplateSettingsType<z.AnyZodObject> = this.parsedUserSettings as TemplateSettingsType<z.AnyZodObject>;
    if (this.destinationProject) {
      newUserSettings = {
        ...newUserSettings,
        project_name: this.destinationProject.instantiatedProjectSettings.projectName,
      };
      if (this.currentlyGeneratingTemplate?.parentTemplate && this.currentlyGeneratingTemplateParentInstanceId) {
        newUserSettings = {
          ...newUserSettings,
          ...this.destinationProject.getInstantiatedSettings(this.currentlyGeneratingTemplate.parentTemplate, this.currentlyGeneratingTemplateParentInstanceId),
        };
      }
    } else {
      newUserSettings = {
        ...newUserSettings,
        project_name: path.basename(this.absDestinationProjectPath),
      };
    }
    this.currentlyGeneratingTemplateFullSettings = newUserSettings;
  }

  private getTargetPath(): string {
    if (!this.currentlyGeneratingTemplate || !this.currentlyGeneratingTemplateFullSettings) {
      throw new Error('No template is currently being generated.');
    }
    const targetPath = this.currentlyGeneratingTemplate.config.targetPath;
    if (!targetPath) {
      return '.';
    }
    return stringOrCallbackToString(targetPath, this.currentlyGeneratingTemplateFullSettings);
  }

  private getAbsoluteTargetPath(): string {
    return path.join(this.absDestinationProjectPath, this.getTargetPath());
  }

  /**
   * Copies all files from the template’s adjacent "templates" directory to the destination.
   * Files are processed with Handlebars. If a file ends in ".hbs", the extension is removed.
   */
  private async copyDirectory(): Promise<void> {
    if (!this.currentlyGeneratingTemplate) {
      throw new Error('No template is currently being generated.');
    }
    const src = this.currentlyGeneratingTemplate.absoluteTemplatesDir;
    const dest = this.getAbsoluteTargetPath();

    await fs.mkdir(dest, { recursive: true });

    const entries = await glob(`**/*`, { cwd: src, dot: true, nodir: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      let destPath = path.join(dest, entry);

      if (destPath.endsWith('.hbs')) {
        destPath = destPath.slice(0, -4);
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
    if (!this.currentlyGeneratingTemplate || !this.currentlyGeneratingTemplateFullSettings) {
      throw new Error('No template is currently being generated.');
    }
    const sideEffects = this.currentlyGeneratingTemplate.config.sideEffects;
    await Promise.all(
      sideEffects.map(({ filePath, apply }) => {
        return this.applySideEffect(stringOrCallbackToString(filePath, this.currentlyGeneratingTemplateFullSettings), apply);
      })
    );
  }

  /**
   * Reads the target file, applies the side effect function using Handlebars templating data, and writes the new content.
   */
  private async applySideEffect(
    filePath: string,
    sideEffectFunction: SideEffectFunction
  ) {
    const absoluteFilePath = path.join(this.absDestinationProjectPath, filePath);
    let oldFileContents = '';
    try {
      oldFileContents = await fs.readFile(absoluteFilePath, 'utf8');
    } catch {
      // ignore so just creates file
    }
    const sideEffectResult = await sideEffectFunction(this.currentlyGeneratingTemplateFullSettings, oldFileContents);
    if (!sideEffectResult) {
      return;
    }
    await fs.writeFile(absoluteFilePath, sideEffectResult, 'utf8');
  }

  private setTemplateGenerationValues(template: Template, parentInstanceId?: string) {
    this.currentlyGeneratingTemplate = template;
    this.currentlyGeneratingTemplateParentInstanceId = parentInstanceId;
    this.updateParsedUserSettingsWithParentSettings();
  }

  /**
   * Instantiates the template by copying files from the template’s directory, processing them with Handlebars,
   * and then applying any defined side effects.
   *
   * @param templateName The name of the template to instantiate.s
   * @returns The absolute path where templated files are written.
   */
  public async instantiateTemplate(templateName: string, parentInstanceId: string): Promise<Result<string>> {
    if (!this.destinationProject) {
      console.error('No destination project provided.');
      return { error: 'No destination project provided.' };
    }
    const template = this.rootTemplate.findSubTemplate(templateName);
    if (!template) {
      console.error(`Template ${templateName} could not be found in rootTemplate ${this.rootTemplate.config.templateConfig.name}`);
      return { error: `Template ${templateName} could not be found in rootTemplate ${this.rootTemplate.config.templateConfig.name}` };
    }

    for (const instantiatedTemplate of this.destinationProject.instantiatedProjectSettings.instantiatedTemplates) {
      if (instantiatedTemplate.id === parentInstanceId && instantiatedTemplate.templateName === templateName && !template.config.templateConfig.multiInstance) {
        console.error(`Template ${templateName} is already instantiated.`);
        return { error: `Template ${templateName} is already instantiated.` };
      }
    }

    this.setTemplateGenerationValues(template, parentInstanceId);

    try {
      await this.copyDirectory();
      await this.applySideEffects();
      await Project.addTemplateToSettings(this.absDestinationProjectPath, parentInstanceId, template, this.parsedUserSettings);
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
  public async instantiateNewProject(): Promise<Result<string>> {
    const dirStat = await fs.stat(this.absDestinationProjectPath).catch(() => null);
    if (dirStat && dirStat.isDirectory()) {
      console.error(`Directory ${this.absDestinationProjectPath} already exists.`);
      return { error: `Directory ${this.absDestinationProjectPath} already exists.` };
    }

    const projectName = path.basename(this.absDestinationProjectPath);

    const newProjectSettings: ProjectSettings = {
      projectName,
      projectAuthor: this.parsedUserSettings.author,
      rootTemplateName: this.rootTemplate.config.templateConfig.name,
      instantiatedTemplates: [
        {
          id: crypto.randomUUID(),
          parentId: undefined,
          templateName: this.rootTemplate.config.templateConfig.name,
          templateSettings: this.parsedUserSettings,
        },
      ],
    };

    this.setTemplateGenerationValues(this.rootTemplate);

    try {
      await fs.mkdir(this.absDestinationProjectPath, { recursive: true });
      await this.copyDirectory();
      await this.applySideEffects();
      await Project.writeNewProjectSettings(this.absDestinationProjectPath, newProjectSettings);
    } catch (e) {
      console.error(`Failed to instantiate new project: ${e}`);
      return { error: `Failed to instantiate new project: ${e}` };
    }
    return { data: this.absDestinationProjectPath };
  }
}

