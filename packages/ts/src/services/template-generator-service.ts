import { SideEffectFunction, UserTemplateSettings } from '@timonteutelink/template-types-lib';
import { glob } from 'glob';
import fs from 'fs-extra';
import * as path from 'node:path';
import { Template } from '../models/template-models';
import Handlebars from 'handlebars';

export class TemplateGeneratorService {
  public destinationProjectRoot: string;
  public rootTemplate: Template;
  public parsedUserSettings: UserTemplateSettings;//this is only for root but needed for every single template. Create datastructure to store the template with the settings together.
  // There should be a Project class which holds the rootTemplate and the destinationProjectRoot. Then it can parse the templateConfig.json in the destinationProjectRoot and store the settings of all subtemplates. So will need a nested structure of UserTemplateSettings. Make sure children have available options of parents

  constructor(rootTemplate: Template, userSettings: UserTemplateSettings, destinationProjectRoot: string) {
    this.destinationProjectRoot = destinationProjectRoot;
    this.rootTemplate = rootTemplate;
    this.parsedUserSettings = rootTemplate.templateConfigModule.templateSettingsSchema.parse(userSettings);
  }

  private findTemplate(templateName: string, startingTemplate: Template = this.rootTemplate): Template | null {
    if (startingTemplate.templateConfigModule.templateConfig.name == templateName) {
      return startingTemplate
    }

    for (const [subTemplatesDir, subTemplates] of Object.entries(startingTemplate.subTemplates)) {
      for (const [subTemplateDir, subTemplate] of Object.entries(subTemplates)) {
        if (subTemplate.templateConfigModule.templateConfig.name == templateName) {
          return subTemplate;
        }
        const deeper = this.findTemplate(templateName, subTemplate);
        if (deeper) {
          return deeper;
        }
      }
    }

    return null;
  }

  private stringOrCallbackToString(stringOrCallback: string | ((settings: UserTemplateSettings) => string)): string {
    return typeof stringOrCallback === 'string' ? stringOrCallback : stringOrCallback(this.parsedUserSettings);
  }

  private getTargetPath(template: Template): string {
    const targetPath = template.templateConfigModule.targetPath;
    if (!targetPath) {
      return '.';
    }
    return this.stringOrCallbackToString(targetPath);
  }

  private getAbsoluteTargetPath(template: Template): string {
    return path.join(this.destinationProjectRoot, this.getTargetPath(template));
  }

  // step 1: copy all files to be templated from 'templates' to destination
  // step 2: apply side effects
  // step 3 (Optional): show results to user and iterative with user to improve(only on small templates)
  public async instantiateTemplate(templateName: string): Promise<string> {
    const template = this.findTemplate(templateName);
    if (!template) {
      throw Error(`Template ${templateName} could not be found in rootTemplate ${this.rootTemplate.templateConfigModule.templateConfig.name}`)
    }
    await this.copyDirectory(template);
    await this.applySideEffects(template);
    return this.getAbsoluteTargetPath(template);
  }

  private async copyDirectory(
    template: Template,
  ): Promise<void> {
    const src = template.templatesDirPath;
    const dest = this.getAbsoluteTargetPath(template);

    // Create the destination directory if it does not exist.
    await fs.mkdir(dest, { recursive: true });

    const entries = await glob("**/*", { cwd: src, dot: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);

      const stats = await fs.stat(srcPath);
      if (stats.isDirectory()) continue;

      const content = await fs.readFile(srcPath, "utf-8");
      const template = Handlebars.compile(content);
      const result = template(this.parsedUserSettings);

      await fs.ensureDir(path.dirname(destPath));
      await fs.writeFile(destPath, result, "utf-8");

      console.log(`Generated: ${destPath}`);
    }
  }

  private async applySideEffects(template: Template) {
    const sideEffects = template.templateConfigModule.sideEffects;

    await Promise.all(sideEffects.map(({ filePath, apply }) => this.applySideEffect(this.stringOrCallbackToString(filePath), apply)))
  }

  private async applySideEffect(filePath: string, sideEffectFunction: SideEffectFunction<UserTemplateSettings>) {
    const absoluteFilePath = path.join(this.destinationProjectRoot, filePath);
    const oldFileContents = await fs.readFile(absoluteFilePath, 'utf8');
    const sideEffectResult = sideEffectFunction(this.parsedUserSettings, oldFileContents);
    if (!sideEffectResult) {
      return;
    }
    await fs.writeFile(absoluteFilePath, sideEffectResult, 'utf8');
  }
}
