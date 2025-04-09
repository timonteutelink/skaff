import { UserTemplateSettings, SideEffectFunction } from '@timonteutelink/template-types-lib';
import fs from 'fs-extra';
import { glob } from 'glob';
import Handlebars from 'handlebars';
import * as path from 'node:path';
import { Template } from '../models/template-models';
import { stringOrCallbackToString } from '../utils/utils';
import { Project } from '../models/project-models';
import { ProjectSettings, Result } from '../utils/types';

export class TemplateGeneratorService {
  public absDestinationProjectPath: string;
  public destinationProject?: Project;
  public rootTemplate: Template;
  public parsedUserSettings: UserTemplateSettings;

  constructor(rootTemplate: Template, userSettings: UserTemplateSettings, absDestinationProjectPath: string, destinationProject?: Project) {
    this.absDestinationProjectPath = absDestinationProjectPath;
    this.destinationProject = destinationProject;
    this.rootTemplate = rootTemplate;
    this.parsedUserSettings = rootTemplate.config.templateSettingsSchema.parse(userSettings);
  }

  private getParsedUserSettingsWithParentSettings(template: Template): UserTemplateSettings {
    let newUserSettings = this.parsedUserSettings;
    if (this.destinationProject && template.parentTemplate) {
      newUserSettings = {
        ...newUserSettings,
        ...this.destinationProject.getInstantiatedSettings(template.parentTemplate),
      };
    }
    return newUserSettings;
  }

  private getTargetPath(template: Template): string {
    const targetPath = template.config.targetPath;
    if (!targetPath) {
      return '.';
    }
    return stringOrCallbackToString(targetPath, this.getParsedUserSettingsWithParentSettings(template));
  }

  private getAbsoluteTargetPath(template: Template): string {
    return path.join(this.absDestinationProjectPath, this.getTargetPath(template));
  }

  /**
   * Copies all files from the template’s adjacent "templates" directory to the destination.
   * Files are processed with Handlebars. If a file ends in ".hbs", the extension is removed.
   */
  private async copyDirectory(template: Template): Promise<void> {
    const src = template.absoluteTemplatesDir;
    const dest = this.getAbsoluteTargetPath(template);

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
      const result = compiled(this.getParsedUserSettingsWithParentSettings(template));

      await fs.ensureDir(path.dirname(destPath));
      await fs.writeFile(destPath, result, "utf-8");

      console.log(`Generated: ${destPath}`);
    }
  }

  /**
   * Applies side effects defined in the template configuration.
   */
  private async applySideEffects(template: Template) {
    const sideEffects = template.config.sideEffects;
    await Promise.all(
      sideEffects.map(({ filePath, apply }) => {
        const parsedUserSettings = this.getParsedUserSettingsWithParentSettings(template);
        return this.applySideEffect(parsedUserSettings, stringOrCallbackToString(filePath, parsedUserSettings), apply);
      })
    );
  }

  /**
   * Reads the target file, applies the side effect function using Handlebars templating data, and writes the new content.
   */
  private async applySideEffect(
    userSettings: UserTemplateSettings,
    filePath: string,
    sideEffectFunction: SideEffectFunction<UserTemplateSettings>
  ) {
    const absoluteFilePath = path.join(this.absDestinationProjectPath, filePath);
    let oldFileContents = '';
    try {
      oldFileContents = await fs.readFile(absoluteFilePath, 'utf8');
    } catch (e) {
      // ignore so just creates file
    }
    const sideEffectResult = sideEffectFunction(userSettings, oldFileContents);
    if (!sideEffectResult) {
      return;
    }
    await fs.writeFile(absoluteFilePath, sideEffectResult, 'utf8');
  }

  /**
   * Instantiates the template by copying files from the template’s directory, processing them with Handlebars,
   * and then applying any defined side effects.
   *
   * @param templateName The name of the template to instantiate.s
   * @returns The absolute path where templated files are written.
   */
  public async instantiateTemplate(templateName: string): Promise<Result<string>> {
    if (!this.destinationProject) {
      console.error('No destination project provided.');
      return { error: 'No destination project provided.' };
    }
    const template = this.rootTemplate.findSubTemplate(templateName);
    if (!template) {
      console.error(`Template ${templateName} could not be found in rootTemplate ${this.rootTemplate.config.templateConfig.name}`);
      return { error: `Template ${templateName} could not be found in rootTemplate ${this.rootTemplate.config.templateConfig.name}` };
    }
    try {
      await this.copyDirectory(template);
      await this.applySideEffects(template);
      await Project.addTemplateToSettings(this.absDestinationProjectPath, template.config.templateConfig.name, this.parsedUserSettings);
    } catch (e) {
      console.error(`Failed to instantiate template: ${e}`);
      return { error: `Failed to instantiate template: ${e}` };
    }
    return { data: this.getAbsoluteTargetPath(template) };
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
          templateName: this.rootTemplate.config.templateConfig.name,
          templateSettings: this.parsedUserSettings,
        },
      ],
    };

    try {
      await fs.mkdir(this.absDestinationProjectPath, { recursive: true });
      await this.copyDirectory(this.rootTemplate);
      await this.applySideEffects(this.rootTemplate);
      await Project.writeNewProjectSettings(this.absDestinationProjectPath, newProjectSettings);
    } catch (e) {
      console.error(`Failed to instantiate new project: ${e}`);
      return { error: `Failed to instantiate new project: ${e}` };
    }
    return { data: this.absDestinationProjectPath };
  }
}

