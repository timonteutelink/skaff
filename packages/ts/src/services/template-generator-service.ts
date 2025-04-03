import { SideEffectFunction, UserTemplateSettings } from '@timonteutelink/template-types-lib';
import { glob } from 'glob';
import fs from 'fs-extra';
import * as path from 'node:path';
import { Template } from '../models/template-models';
import Handlebars from 'handlebars';

export class TemplateGeneratorService {
  public destinationProjectRoot: string;
  public rootTemplate: Template;
  public parsedUserSettings: UserTemplateSettings;

  constructor(rootTemplate: Template, userSettings: UserTemplateSettings, destinationProjectRoot: string) {
    this.destinationProjectRoot = destinationProjectRoot;
    this.rootTemplate = rootTemplate;
    this.parsedUserSettings = rootTemplate.config.templateSettingsSchema.parse(userSettings);
  }

  private findTemplate(templateName: string, startingTemplate: Template = this.rootTemplate): Template | null {
    if (startingTemplate.config.templateConfig.name === templateName) {
      return startingTemplate;
    }

    for (const subTemplate of Object.values(startingTemplate.subTemplates)) {
      if (subTemplate.config.templateConfig.name === templateName) {
        return subTemplate;
      }
      const deeper = this.findTemplate(templateName, subTemplate);
      if (deeper) {
        return deeper;
      }
    }

    return null;
  }

  private stringOrCallbackToString(stringOrCallback: string | ((settings: UserTemplateSettings) => string)): string {
    return typeof stringOrCallback === 'string' ? stringOrCallback : stringOrCallback(this.parsedUserSettings);
  }

  private getTargetPath(template: Template): string {
    const targetPath = template.config.targetPath;
    if (!targetPath) {
      return '.';
    }
    return this.stringOrCallbackToString(targetPath);
  }

  private getAbsoluteTargetPath(template: Template): string {
    return path.join(this.destinationProjectRoot, this.getTargetPath(template));
  }

  /**
   * Copies all files from the template’s adjacent "templates" directory to the destination.
   * Files are processed with Handlebars. If a file ends in ".hbs", the extension is removed.
   */
  private async copyDirectory(template: Template): Promise<void> {
    const src = template.templatesDir;
    const dest = this.getAbsoluteTargetPath(template);

    // Ensure the destination directory exists.
    await fs.mkdir(dest, { recursive: true });

    const entries = await glob("**/*", { cwd: src, dot: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      let destPath = path.join(dest, entry);
      // Remove the ".hbs" extension if present.
      if (destPath.endsWith('.hbs')) {
        destPath = destPath.slice(0, -4);
      }

      const stats = await fs.stat(srcPath);
      if (stats.isDirectory()) continue;

      const content = await fs.readFile(srcPath, "utf-8");
      const compiled = Handlebars.compile(content);
      const result = compiled(this.parsedUserSettings);

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
      sideEffects.map(({ filePath, apply }) =>
        this.applySideEffect(this.stringOrCallbackToString(filePath), apply)
      )
    );
  }

  /**
   * Reads the target file, applies the side effect function using Handlebars templating data, and writes the new content.
   */
  private async applySideEffect(
    filePath: string,
    sideEffectFunction: SideEffectFunction<UserTemplateSettings>
  ) {
    const absoluteFilePath = path.join(this.destinationProjectRoot, filePath);
    const oldFileContents = await fs.readFile(absoluteFilePath, 'utf8');
    const sideEffectResult = sideEffectFunction(this.parsedUserSettings, oldFileContents);
    if (!sideEffectResult) {
      return;
    }
    await fs.writeFile(absoluteFilePath, sideEffectResult, 'utf8');
  }

  /**
   * Instantiates the template by copying files from the template’s directory, processing them with Handlebars,
   * and then applying any defined side effects.
   *
   * @param templateName The name of the template to instantiate.
   * @returns The absolute path where templated files are written.
   */
  public async instantiateTemplate(templateName: string): Promise<string> {
    const template = this.findTemplate(templateName);
    if (!template) {
      throw Error(
        `Template ${templateName} could not be found in rootTemplate ${this.rootTemplate.config.templateConfig.name}`
      );
    }
    await this.copyDirectory(template);
    await this.applySideEffects(template);
    return this.getAbsoluteTargetPath(template);
  }
}

