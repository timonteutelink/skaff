import {
  TemplateConfigModule,
  TemplateSettingsType,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import z from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  loadAllTemplateConfigs,
  TemplateConfigWithFileInfo,
} from "../loaders/template-config-loader";
import { glob } from "glob";
import { getCacheDirPath } from "../services/cache-service";
import { getCommitHash, isGitRepoClean } from "../services/git-service";
import { TemplateGeneratorService } from "../services/template-generator-service";
import {
  CreateProjectResult,
  ProjectSettings,
  Result,
  TemplateDTO,
} from "../lib/types";
import { Project } from "./project";
import { logger } from "../lib/logger";

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

  public foundPartials?: Record<string, string>;

  // The directory containing the root template
  // TODO move this one higher to point to the root of the git repo containing everything
  public absoluteBaseDir: string; // The absolute path of the parent directory of the root template. All uri will be based from here.

  // The directory containing the "templateConfig.ts" and "templates" directory
  public absoluteDir: string; // The absolute path of this template’s directory.
  public relativeDir: string; // Relative path from the rootDir.

  // paths to "templates" directory containing the files to be templated.
  public absoluteTemplatesDir: string;
  public relativeTemplatesDir: string;

  // paths to "partials" directory containing all partials that this template and children can use.
  public absolutePartialsDir?: string;
  public relativePartialsDir?: string;

  // If this template was reffed, store the dir containing the templateRef.json.
  public relativeRefDir?: string;

  // The commit hash of the template. Will only be defined for root templates or the root of referenced templates in the future.
  public commitHash?: string;

  // If this is the template defined by the user or a revisions stored in the cache.
  public isDefault: boolean = false;

  private constructor(
    config: TemplateConfigModule<
      TemplateSettingsType<z.AnyZodObject>,
      z.AnyZodObject
    >,
    baseDir: string,
    absDir: string,
    templatesDir: string,
    commitHash?: string,
    refDir?: string,
    partialsDir?: string,
  ) {
    this.absoluteBaseDir = baseDir;

    this.absoluteDir = absDir;
    this.relativeDir = path.relative(baseDir, absDir);

    this.absoluteTemplatesDir = templatesDir;
    this.relativeTemplatesDir = path.relative(baseDir, templatesDir);

    this.absolutePartialsDir = partialsDir
      ? path.resolve(baseDir, partialsDir)
      : undefined;
    this.relativePartialsDir = partialsDir

    this.relativeRefDir = refDir;

    this.config = config;

    this.commitHash = commitHash;

    if (!this.absoluteBaseDir.startsWith(getCacheDirPath())) {
      this.isDefault = true;
    }
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
    const isRepoClean = await isGitRepoClean(absoluteBaseDir);
    if ("error" in isRepoClean) {
      return {
        error: isRepoClean.error,
      };
    }
    if (!isRepoClean.data) {
      logger.debug(`Ignoring template because the repo is not clean`);
      return { error: "Template dir is not clean" };
    }
    const commitHash = await getCommitHash(absoluteRootDir);
    if ("error" in commitHash) {
      return {
        error: commitHash.error,
      };
    }

    let configs: Record<string, TemplateConfigWithFileInfo>;
    try {
      configs = await loadAllTemplateConfigs(absoluteRootDir);
    } catch (error) {
      logger.error(
        { error, absoluteRootDir },
        `Failed to load template configurations`,
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

      let partialsDir: string | undefined = path.join(templateDir, "partials");
      try {
        const stat = await fs.stat(partialsDir);
        if (!stat.isDirectory()) partialsDir = undefined;
      } catch {
        partialsDir = undefined;
      }

      let rootCommitHash: string | undefined = "";

      if (templateDir === absoluteRootDir) {
        rootCommitHash = commitHash.data;
      }

      const template = new Template(
        info.templateConfig,
        absoluteBaseDir,
        templateDir,
        templatesDir,
        rootCommitHash,
        info.refDir,
        partialsDir,
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
        if (
          !relative ||
          relative.startsWith("..") ||
          path.isAbsolute(relative)
        ) {
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
      logger.error(`No root templates found.`);
      return { error: "No root templates found" };
    }

    if (rootTemplates.length > 1) {
      logger.error(
        { rootTemplates },
        `Multiple root templates found. Make sure the directory structure is correct.`,
      );
      return {
        error:
          "Multiple root templates found. Make sure the directory structure is correct.",
      };
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
      return addTemplateResult;
    }

    const resultPath = await generatorService.instantiateTemplateInProject(
      addTemplateResult.data,
    );

    if ("error" in resultPath) {
      return resultPath;
    } else {
      logger.info(`Template instantiated at: ${resultPath.data}`);
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
      projectAuthor: "abc",
      rootTemplateName: this.config.templateConfig.name,
      instantiatedTemplates: [],
    };

    const generatorService = new TemplateGeneratorService(
      { absoluteDestinationPath: path.join(destinationDir, projectName) },
      this,
      newProjectSettings,
    );
    const addProjectResult =
      generatorService.addNewProject(rootTemplateSettings);

    if ("error" in addProjectResult) {
      return addProjectResult;
    }
    const result = await generatorService.instantiateNewProject();
    if (!("error" in result)) {
      logger.info(`New project created at: ${result.data.resultPath}`);
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
      currentCommitHash: this.commitHash,
      templatesThatDisableThis: this.config.templatesThatDisableThis || [],
      templateCommands: this.config.commands?.map((command) => ({
        title: command.title,
        description: command.description,
      })) || [],
      isDefault: this.isDefault,
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
    let currentTemplate: Template = this;
    while (currentTemplate.parentTemplate) {
      currentTemplate = currentTemplate.parentTemplate;
    }
    return currentTemplate!;
  }

  public findCommitHash(): string {
    if (this.commitHash) {
      return this.commitHash;
    }
    if (this.parentTemplate) {
      return this.parentTemplate.findCommitHash();
    }
    return "";
  }

  /**
   * Finds all partials in the template and its parents.
   * Does this by finding all files in the partials directory if exists. Then using await glob(`**\/*`, {cwd: src, dot: false, nodir: true}) to find ALL FILES in the directory and subdirectories and use the part before the first dot as the key of the partial. The path to the file is the value.
   * If the partials directory does not exist, it will return only the partials of the parent templates.
   */
  public async findAllPartials(): Promise<Result<Record<string, string>>> {
    if (this.foundPartials) {
      return { data: this.foundPartials };
    }
    const partials: Record<string, string> = {};
    if (this.absolutePartialsDir) {
      try {
        const entries = await glob(`**/*`, { cwd: this.absolutePartialsDir, dot: false, nodir: true });
        for (const entry of entries) {
          const key = entry.split(".")[0]!;
          const value = path.join(this.absolutePartialsDir, entry);
          partials[key] = value;
        }
      } catch (error) {
        logger.error(
          { error, absolutePartialsDir: this.absolutePartialsDir },
          `Failed to read partials directory`,
        );
        return { error: `Failed to read partials directory: ${error}` };
      }
    }

    if (this.parentTemplate) {
      const parentPartialsResult = await this.parentTemplate.findAllPartials();
      if ("error" in parentPartialsResult) {
        return parentPartialsResult;
      }
      for (const [key, value] of Object.entries(parentPartialsResult.data)) {
        if (!partials[key]) {
          partials[key] = value;
        }
      }
    }
    this.foundPartials = partials;
    return { data: partials };
  }

  public async isValid(): Promise<boolean> {
    const isRepoClean = await isGitRepoClean(this.absoluteBaseDir);
    if ("error" in isRepoClean) {
      return false;
    }

    const commitResult = await getCommitHash(this.absoluteBaseDir);
    if ("error" in commitResult) {
      return false;
    }

    return isRepoClean.data && commitResult.data === this.findCommitHash();
  }
}
