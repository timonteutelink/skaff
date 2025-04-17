import * as fs from "node:fs/promises";
import * as path from "node:path";
import { loadAllTemplateConfigs, TemplateConfigWithFileInfo } from "../loaders/template-config-loader";
import { TemplateGeneratorService } from "../services/template-generator-service";
import {
  TemplateConfigModule,
  TemplateSettingsType,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import { zodToJsonSchema } from "zod-to-json-schema";
import { CreateProjectResult, ProjectSettings, Result, TemplateDTO } from "../utils/types";
import { Project } from "./project-models";
import z from "zod";

export class Template {
  // The loaded configuration module.
  public config: TemplateConfigModule<
    TemplateSettingsType<z.AnyZodObject>,
    z.AnyZodObject
  >;
  // Subtemplates, keyed by the immediate subdirectory name (each key holds an array of children).
  public subTemplates: Record<string, Template[]> = {};
  // A reference to the parent template, if this is a subtemplate.
  public parentTemplate?: Template;

  // The directory containing the root template
  public absoluteBaseDir: string; // The absolute path of the parent directory of the root template. All uri will be based from here.

  // The directory containing the "templateConfig.ts" and "templates" directory
  public absoluteDir: string; // The absolute path of this template’s directory.
  public relativeDir: string; // Relative path from the rootDir.

  // paths to "templates" directory containing the files to be templated.
  public absoluteTemplatesDir: string;
  public relativeTemplatesDir: string;

  // If this template was reffed, store the dir containing the templateRef.json.
  public relativeRefDir?: string;

  private constructor(
    config: TemplateConfigModule<
      TemplateSettingsType<z.AnyZodObject>,
      z.AnyZodObject
    >,
    baseDir: string,
    absDir: string,
    templatesDir: string,
    refDir?: string,
  ) {
    this.absoluteBaseDir = baseDir;
    this.absoluteDir = absDir;
    this.relativeDir = path.relative(baseDir, absDir);
    this.absoluteTemplatesDir = templatesDir;
    this.relativeTemplatesDir = path.relative(baseDir, templatesDir);
    this.relativeRefDir = refDir;

    this.config = config;
  }

  /**
   * Loads all template configurations under the given root directory using loadAllTemplateConfigs.
   * A Template instance is created for every config file that has an adjacent "templates" folder.
   * Parent–child relationships are inferred either by a templateRef.json reference
   * or by checking for nested directories.
   *
   * For example, if a template is located at:
   *   <parent-dir>/project-types/<sub-template-dir>
   * then the key will be 'project-types'.
   *
   * @param rootTemplateDir The directory containing the templateConfig.ts and templates folder of the root of this template
   * @returns A single top-level Template instance.
   */
  public static async createAllTemplates(
    rootTemplateDir: string,
  ): Promise<Result<Template>> {
    const absoluteRootDir = path.resolve(rootTemplateDir);
    const absoluteBaseDir = path.dirname(absoluteRootDir);
    let configs: Record<string, TemplateConfigWithFileInfo>;
    try {
      configs = await loadAllTemplateConfigs(absoluteRootDir);
    } catch (error) {
      console.error(
        `Failed to load template configurations from ${absoluteRootDir}: ${error}`,
      );
      return { error: `Failed to load template configurations: ${error}` };
    }
    const templatesMap: Record<string, Template> = {};

    // Create Template instances only for directories with an adjacent "templates" folder.
    for (const info of Object.values(configs)) {
      const templateDir = path.dirname(
        path.resolve(absoluteRootDir, info.configPath),
      );
      const templatesDir = path.join(templateDir, "templates");
      try {
        const stat = await fs.stat(templatesDir);
        if (!stat.isDirectory()) continue;
      } catch {
        continue;
      }
      const template = new Template(
        info.templateConfig,
        absoluteBaseDir,
        templateDir,
        templatesDir,
        info.refDir,
      );
      templatesMap[templateDir] = template;
    }

    const allTemplates = Object.values(templatesMap);

    // First pass: Handle explicit parent–child links via templateRef.json.
    // For each candidate with a refDir, we resolve it relative to the absoluteRootDir.
    // Then, we use path.dirname(refAbsolute) as the intended parent's directory,
    // and use the basename (e.g. "github-actions") as the key.
    for (const candidate of allTemplates) {
      if (candidate.relativeRefDir) {
        const refAbsolute = path.resolve(
          absoluteRootDir,
          candidate.relativeRefDir,
        );
        const intendedParentDir = path.dirname(refAbsolute);
        const parent = templatesMap[intendedParentDir];
        if (parent) {
          candidate.parentTemplate = parent;
          const key = path.basename(refAbsolute);
          if (!parent.subTemplates[key]) {
            parent.subTemplates[key] = [];
          }
          parent.subTemplates[key].push(candidate);
        }
      }
    }

    // Second pass: Infer parent–child relationships by directory containment.
    for (const candidate of allTemplates) {
      if (candidate.parentTemplate) continue;

      let immediateParent: Template | null = null;
      let longestMatchLength = 0;

      for (const potentialParent of allTemplates) {
        if (potentialParent === candidate) continue;
        const relative = path.relative(
          potentialParent.absoluteDir,
          candidate.absoluteDir,
        );
        if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
          continue;
        }
        const segments = relative.split(path.sep).filter(Boolean);
        if (segments[0] === "templates") continue;
        if (potentialParent.absoluteDir.length > longestMatchLength) {
          immediateParent = potentialParent;
          longestMatchLength = potentialParent.absoluteDir.length;
        }
      }

      if (immediateParent) {
        const relPath = path.relative(
          immediateParent.absoluteDir,
          candidate.absoluteDir,
        );
        const key = relPath.split(path.sep)[0];
        if (!key) continue;
        if (!immediateParent.subTemplates[key]) {
          immediateParent.subTemplates[key] = [];
        }
        immediateParent.subTemplates[key].push(candidate);
        candidate.parentTemplate = immediateParent;
      }
    }

    // Determine the root template(s).
    const rootTemplates = allTemplates.filter(
      (template) => !template.parentTemplate,
    );
    if (rootTemplates.length === 0) {
      console.error(`No root templates found.`);
      return { error: "No root templates found" };
    }

    if (rootTemplates.length > 1) {
      console.error(rootTemplates);
      console.error(`Multiple root templates found. Make sure the directory structure is correct.`);
      return { error: "Multiple root templates found. Make sure the directory structure is correct." };
    }

    return { data: rootTemplates[0]! };
  }

  /**
   * Instantiates a subtemplate using the TemplateGeneratorService.
   *banana
   * @param userSettings The settings provided by the user.
   * @param destinationProject The project where the template will be instantiated.
   */
  public async templateInExistingProject(
    userSettings: UserTemplateSettings,
    destinationProject: Project,
    parentInstanceId: string,
  ): Promise<Result<string>> {
    const generatorService = new TemplateGeneratorService(
      { absoluteDestinationPath: destinationProject.absoluteRootDir },
      this,
      destinationProject.instantiatedProjectSettings,
    );

    const addTemplateResult = generatorService.addNewTemplate(
      userSettings,
      this.config.templateConfig.name,
      parentInstanceId,
    );

    if ("error" in addTemplateResult) {
      console.error(`Failed to add template to project: ${addTemplateResult.error}`);
      return addTemplateResult;
    }

    const resultPath = await generatorService.instantiateTemplateInProject(
      addTemplateResult.data,
    );

    if ("error" in resultPath) {
      console.error(`Failed to instantiate template: ${resultPath.error}`);
      return resultPath;
    } else {
      console.log(`Template instantiated at: ${resultPath.data}`);
    }
    return resultPath;
  }
  //TODO add support for loose templates which can be instantiated anywhere and will not be tracked using a templateSettings.json
  //TODO allow a file to contain just a ref to another file in files dir. Name will be decided by file doing reference.

  /**
   * Instantiates the root template using the TemplateGeneratorService.
   * @param rootTemplateSettings The settings provided by the user.
   * @param destinationDir The directory where the template will be instantiated.
   * @param projectName The name of the project.
   * @returns The absolute path of the folder where the templated files are written.
   * @throws Error if the template cannot be found.
   * */
  public async instantiateNewProject(
    rootTemplateSettings: UserTemplateSettings,
    destinationDir: string,
    projectName: string,
  ): Promise<Result<CreateProjectResult>> {
    const newProjectSettings: ProjectSettings = {
      projectName,
      projectAuthor: 'abc',
      rootTemplateName: this.config.templateConfig.name,
      instantiatedTemplates: [],
    }

    const generatorService = new TemplateGeneratorService(
      { absoluteDestinationPath: path.join(destinationDir, projectName) },
      this,
      newProjectSettings,
    );
    const addProjectResult = generatorService.addNewProject(rootTemplateSettings);
    if ("error" in addProjectResult) {
      console.error(`Failed to add project: ${addProjectResult.error}`);
      return addProjectResult;
    }
    const result = await generatorService.instantiateNewProject();
    if ("error" in result) {
      console.error(`Failed to instantiate new project: ${result.error}`);
    } else {
      console.log(`New project created at: ${result.data.resultPath}`);
    }
    return result;
  }

  public mapToDTO(): TemplateDTO {
    const subTemplates: Record<string, TemplateDTO[]> = {};
    for (const [key, value] of Object.entries(this.subTemplates)) {
      subTemplates[key] = value.map((template) => template.mapToDTO());
    }
    return {
      dir: this.relativeDir,
      config: {
        templateConfig: this.config.templateConfig,
        templateSettingsSchema: zodToJsonSchema(
          this.config.templateSettingsSchema,
        ),
      },
      templatesDir: this.relativeTemplatesDir,
      subTemplates,
      refDir: this.relativeRefDir,
    };
  }

  public findSubTemplate(templateName: string): Template | null {
    if (this.config.templateConfig.name === templateName) {
      return this;
    }
    for (const subTemplate of Object.values(this.subTemplates)) {
      for (const template of subTemplate) {
        if (template.config.templateConfig.name === templateName) {
          return template;
        }
        const deeper = template.findSubTemplate(templateName);
        if (deeper) {
          return deeper;
        }
      }
    }
    return null;
  }

  public findRootTemplate(): Template {
    let currentTemplate: Template | undefined = this;
    while (currentTemplate.parentTemplate) {
      currentTemplate = currentTemplate.parentTemplate;
    }
    return currentTemplate!;
  }
}
