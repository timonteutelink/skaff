import {
  AllowOverwrite,
  AutoInstantiatedSubtemplate,
  FinalTemplateSettings,
  ProjectSettings,
  RedirectFile,
  SideEffectFunction,
  UserTemplateSettings,
  AiResultsObject,
} from "@timonteutelink/template-types-lib";
import z from "zod";
import fs from "fs-extra";
import { glob } from "glob";
import Handlebars, { HelperDelegate } from "handlebars";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { backendLogger } from "../lib/logger";
import { Result } from "../lib/types";
import {
  anyOrCallbackToAny,
  logError,
  stringOrCallbackToString,
} from "../lib/utils";
import { Project } from "../models";
import { Template } from "../models/template";
import { isSubset } from "../utils/shared-utils";
import { makeDir } from "./file-service";
import { FileRollbackManager } from "./file-rollback-service";
import { commitAll, createGitRepo } from "./git-service";
import {
  removeTemplateFromSettings,
  writeNewProjectSettings,
  writeNewTemplateToSettings,
} from "./project-settings-service";
import { latestMigrationUuid } from "./template-migration-service";
import { generateAiResults } from "./ai-service";


function isBinaryContent(buffer: Buffer): boolean {
  const length = Math.min(buffer.length, 512);
  let suspicious = 0;

  for (let i = 0; i < length; i++) {
    const byte = buffer[i]!;
    if (byte === 0) {
      return true;
    }

    if (byte < 7 || (byte > 13 && byte < 32) || byte === 127) {
      suspicious++;
      if (suspicious / length > 0.1) {
        return true;
      }
    }
  }

  return false;
}


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
  private currentlyGeneratingTemplateFinalSettings?: FinalTemplateSettings;
  private currentFileRollbackManager?: FileRollbackManager;
  private currentAiResults: AiResultsObject = {};

  constructor(
    options: GeneratorOptions,
    rootTemplate: Template,
    destinationProjectSettings: ProjectSettings,
  ) {
    this.options = options;
    this.rootTemplate = rootTemplate.findRootTemplate();
    this.destinationProjectSettings = destinationProjectSettings;
  }

  private getTargetPath(): Result<string> {
    if (
      !this.currentlyGeneratingTemplate ||
      !this.currentlyGeneratingTemplateFinalSettings
    ) {
      backendLogger.error("No template is currently being generated.");
      return { error: "No template is currently being generated." };
    }
    const targetPath = this.currentlyGeneratingTemplate.config.targetPath;
    if (!targetPath) {
      return { data: "." };
    }
    const path = stringOrCallbackToString(
      targetPath,
      this.currentlyGeneratingTemplateFinalSettings,
    );
    if ("error" in path) {
      return path;
    }
    return { data: path.data };
  }

  private getAbsoluteTargetPath(): Result<string> {
    const pathResult = this.getTargetPath();

    if ("error" in pathResult) {
      return pathResult;
    }

    return this.resolveWithinDestinationRoot(pathResult.data);
  }

  private getProjectRoot(): string {
    return path.resolve(this.options.absoluteDestinationPath);
  }

  private resolveWithinDestinationRoot(relativePath: string): Result<string> {
    if (path.isAbsolute(relativePath)) {
      const errorMessage =
        `Absolute paths are not allowed inside templates: ${relativePath}`;
      backendLogger.error(errorMessage);
      return { error: errorMessage };
    }

    const normalizedRelativePath = path.normalize(relativePath);
    const absolutePath = path.resolve(
      this.options.absoluteDestinationPath,
      normalizedRelativePath,
    );

    return this.ensurePathWithinProjectRoot(absolutePath);
  }

  private ensurePathWithinProjectRoot(absolutePath: string): Result<string> {
    const projectRoot = this.getProjectRoot();
    const normalizedTargetPath = path.resolve(absolutePath);
    const rootWithSeparator = projectRoot.endsWith(path.sep)
      ? projectRoot
      : `${projectRoot}${path.sep}`;

    if (
      normalizedTargetPath !== projectRoot &&
      !normalizedTargetPath.startsWith(rootWithSeparator)
    ) {
      const errorMessage =
        `Resolved path ${normalizedTargetPath} escapes the project root ${projectRoot}`;
      backendLogger.error(errorMessage);
      return { error: errorMessage };
    }

    return { data: normalizedTargetPath };
  }

  private async ensureDirectoryWithRollback(
    dirPath: string,
  ): Promise<Result<void>> {
    if (this.currentFileRollbackManager) {
      const result = await this.currentFileRollbackManager.ensureDir(dirPath);
      if ("error" in result) {
        logError({
          shortMessage: result.error,
        });
      }
      return result;
    }

    try {
      await fs.ensureDir(dirPath);
    } catch (error) {
      logError({
        shortMessage: `Failed to ensure directory ${dirPath}`,
        error,
      });
      return {
        error: `Failed to ensure directory ${dirPath}: ${error}`,
      };
    }

    return { data: undefined };
  }

  private async recordFileForRollback(filePath: string): Promise<Result<void>> {
    if (!this.currentFileRollbackManager) {
      return { data: undefined };
    }

    const result = await this.currentFileRollbackManager.trackFile(filePath);
    if ("error" in result) {
      logError({
        shortMessage: result.error,
      });
    }
    return result;
  }

  private async prepareFileForWrite(filePath: string): Promise<Result<void>> {
    const dirResult = await this.ensureDirectoryWithRollback(
      path.dirname(filePath),
    );
    if ("error" in dirResult) {
      return dirResult;
    }

    return this.recordFileForRollback(filePath);
  }

  private getRedirects(): Result<RedirectFile[]> {
    if (
      !this.currentlyGeneratingTemplate ||
      !this.currentlyGeneratingTemplateFinalSettings
    ) {
      return { error: "No template is currently being generated." };
    }
    const fullSettings = this.currentlyGeneratingTemplateFinalSettings;
    const redirects = anyOrCallbackToAny(
      this.currentlyGeneratingTemplate.config.redirects,
      fullSettings,
    );
    if ("error" in redirects) {
      return redirects;
    }
    if (!redirects.data) {
      return { data: [] };
    }

    return { data: redirects.data };
  }

  private getOverwrites(): Result<AllowOverwrite[]> {
    if (
      !this.currentlyGeneratingTemplate ||
      !this.currentlyGeneratingTemplateFinalSettings
    ) {
      return { error: "No template is currently being generated." };
    }
    const fullSettings = this.currentlyGeneratingTemplateFinalSettings;
    const overwrites = anyOrCallbackToAny(
      this.currentlyGeneratingTemplate.config.allowedOverwrites,
      fullSettings,
    );
    if ("error" in overwrites) {
      return overwrites;
    }
    if (!overwrites.data) {
      return { data: [] };
    }

    return { data: overwrites.data };
  }

  private getTemplatesToAutoInstantiate(): Result<
    AutoInstantiatedSubtemplate[]
  > {
    if (
      !this.currentlyGeneratingTemplate ||
      !this.currentlyGeneratingTemplateFinalSettings
    ) {
      return { error: "No template is currently being generated." };
    }
    const fullSettings = this.currentlyGeneratingTemplateFinalSettings;
    const templatesToAutoInstantiate = anyOrCallbackToAny(
      this.currentlyGeneratingTemplate.config.autoInstantiatedSubtemplates,
      fullSettings,
    );
    if ("error" in templatesToAutoInstantiate) {
      return templatesToAutoInstantiate;
    }
    if (!templatesToAutoInstantiate.data) {
      return { data: [] };
    }

    return { data: templatesToAutoInstantiate.data };
  }

  private getHandlebarHelpers(): Result<Record<string, HelperDelegate>> {
    if (
      !this.currentlyGeneratingTemplate ||
      !this.currentlyGeneratingTemplateFinalSettings
    ) {
      return { error: "No template is currently being generated." };
    }

    return { data: this.currentlyGeneratingTemplate.config.handlebarHelpers || {} };
  }

  private registerHandlebarHelpers(
    helpers: Record<string, HelperDelegate>,
    unregister?: boolean,
  ): Result<void> {
    for (const [name, helper] of Object.entries(helpers)) {
      if (unregister) {
        Handlebars.unregisterHelper(name);
      } else {
        Handlebars.registerHelper(name, helper);
      }
    }
    return { data: undefined };
  }

  private async loadPartialFiles(
    partials: Record<string, string>,
  ): Promise<Result<Record<string, string>>> {
    const loadedPartials: Record<string, string> = {};
    for (const [name, filePath] of Object.entries(partials)) {
      try {
        const content = await readFile(filePath, { encoding: "utf-8" });
        loadedPartials[name] = content;
      } catch (error) {
        logError({
          shortMessage: `Error loading partial file ${filePath}`,
          error,
        });
        return { error: `Error loading partial file ${filePath}: ${error}` };
      }
    }
    return { data: loadedPartials };
  }

  private async registerAllPartials(
    unregister?: boolean,
  ): Promise<Result<void>> {
    if (!this.currentlyGeneratingTemplate) {
      backendLogger.error("No template is currently being generated.");
      return { error: "No template is currently being generated." };
    }

    const templatePartials =
      await this.currentlyGeneratingTemplate.findAllPartials();

    if ("error" in templatePartials) {
      return templatePartials;
    }

    if (unregister) {
      for (const [name] of Object.entries(templatePartials.data)) {
        Handlebars.unregisterPartial(name);
      }
      return { data: undefined };
    }

    const partialFiles = await this.loadPartialFiles(templatePartials.data);

    if ("error" in partialFiles) {
      return partialFiles;
    }

    for (const [name, partial] of Object.entries(partialFiles.data)) {
      Handlebars.registerPartial(name, partial);
    }
    return { data: undefined };
  }

  /**
   * Copies all files from the template’s adjacent "templates" directory to the destination.
   * Files are processed with Handlebars. If a file ends in ".hbs", the extension is removed.
   */
  // TODO never use a template if commit hashes dont match
  private async copyDirectory(): Promise<Result<void>> {
    if (!this.currentlyGeneratingTemplate) {
      backendLogger.error("No template is currently being generated.");
      return { error: "No template is currently being generated." };
    }

    const src = this.currentlyGeneratingTemplate.absoluteTemplatesDir;

    const dest = this.getAbsoluteTargetPath();

    if ("error" in dest) {
      return dest;
    }

    const redirects = this.getRedirects();

    if ("error" in redirects) {
      return redirects;
    }

    const overwrites = this.getOverwrites();

    if ("error" in overwrites) {
      return overwrites;
    }

    const handlebarHelpers = this.getHandlebarHelpers();

    if ("error" in handlebarHelpers) {
      return handlebarHelpers;
    }

    const registerResult = this.registerHandlebarHelpers(handlebarHelpers.data);

    if ("error" in registerResult) {
      return registerResult;
    }

    const partialRegistrationResult = await this.registerAllPartials();

    if ("error" in partialRegistrationResult) {
      return partialRegistrationResult;
    }

    const cleanup = async () => {
      this.registerHandlebarHelpers(handlebarHelpers.data, true);
      await this.registerAllPartials(true);
    };

    const ensureDestDirResult = await this.ensureDirectoryWithRollback(
      dest.data,
    );

    if ("error" in ensureDestDirResult) {
      await cleanup();
      return ensureDestDirResult;
    }

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

      const normalizedDestPath = this.ensurePathWithinProjectRoot(destPath);

      if ("error" in normalizedDestPath) {
        await cleanup();
        return normalizedDestPath;
      }

      const finalDestinationPath = normalizedDestPath.data;

      try {
        const srcStats = await fs.stat(srcPath);
        if (srcStats.isDirectory()) continue;

        try {
          const destStats = await fs.stat(finalDestinationPath);
          if (destStats.isFile()) {
            const allowedOverwrite = overwrites.data.find((overwrite) =>
              overwrite.srcRegex.test(entry),
            );
            if (!allowedOverwrite || allowedOverwrite.mode === "error") {
              backendLogger.error(`File: ${entry} at ${finalDestinationPath} already exists.`);
              await cleanup();
              return {
                error: `File: ${entry} at ${finalDestinationPath} already exists.`,
              };
            }

            if (allowedOverwrite.mode.endsWith("warn")) {
              backendLogger.warn(
                `File: ${entry} at ${finalDestinationPath} already exists. ${allowedOverwrite.mode.startsWith("ignore") ? "Ignoring" : "Overwriting"} it.`,
              );
            }

            if (allowedOverwrite.mode.startsWith("ignore")) {
              continue;
            }
          }
        } catch { }

        const prepareResult = await this.prepareFileForWrite(
          finalDestinationPath,
        );
        if ("error" in prepareResult) {
          await cleanup();
          return prepareResult;
        }

        const fileBuffer = await fs.readFile(srcPath);
        const shouldTemplate =
          srcPath.endsWith(".hbs") || !isBinaryContent(fileBuffer);

        if (shouldTemplate) {
          const compiled = Handlebars.compile(
            fileBuffer.toString("utf-8"),
            { strict: true },
          );
          const result = compiled(
            this.currentlyGeneratingTemplateFinalSettings,
          );
          await fs.writeFile(finalDestinationPath, result, "utf-8");
        } else {
          await fs.writeFile(finalDestinationPath, fileBuffer);
        }

        await fs.chmod(finalDestinationPath, srcStats.mode);

        backendLogger.debug(`Generated: ${finalDestinationPath}`);
      } catch (error) {
        logError({
          shortMessage: `Error processing file ${srcPath}`,
          error,
        });
        await cleanup();
        return {
          error: `Error processing file ${srcPath}: ${error}`,
        };
      }
    }

    await cleanup();

    return { data: undefined };
  }

  /**
   * Applies side effects defined in the template configuration.
   */
  private async applySideEffects(): Promise<Result<void>> {
    if (
      !this.currentlyGeneratingTemplate ||
      !this.currentlyGeneratingTemplateFinalSettings
    ) {
      backendLogger.error("No template is currently being generated.");
      return { error: "No template is currently being generated." };
    }

    const fullSettings = this.currentlyGeneratingTemplateFinalSettings;
    const sideEffects = anyOrCallbackToAny(
      this.currentlyGeneratingTemplate.config.sideEffects,
      fullSettings,
    );
    if ("error" in sideEffects) {
      return sideEffects;
    }

    for (const sideEffect of sideEffects.data || []) {
      const applyResult = await this.applySideEffect(
        sideEffect.filePath,
        sideEffect.apply,
      );

      if ("error" in applyResult) {
        return applyResult;
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
      !this.currentlyGeneratingTemplateFinalSettings
    ) {
      backendLogger.error("No template is currently being generated.");
      return { error: "No template is currently being generated." };
    }
    const absoluteFilePathResult = this.resolveWithinDestinationRoot(filePath);

    if ("error" in absoluteFilePathResult) {
      return absoluteFilePathResult;
    }

    const absoluteFilePath = absoluteFilePathResult.data;

    let oldFileContents = "";
    try {
      oldFileContents = await readFile(absoluteFilePath, { encoding: "utf8" });
    } catch {
      // ignore so just creates file
    }

    let sideEffectResult: string | null | undefined;
    try {
      sideEffectResult = await sideEffectFunction(
        this.currentlyGeneratingTemplateFinalSettings,
        oldFileContents,
      );
    } catch (error) {
      logError({
        shortMessage: `Failed to apply side effect function`,
        error,
      });
      return { error: `Failed to apply side effect: ${error}` };
    }

    if (!sideEffectResult) {
      backendLogger.debug(`Side effect function returned null. Skipping file write.`);
      return { data: undefined };
    }

    const prepareResult = await this.prepareFileForWrite(absoluteFilePath);
    if ("error" in prepareResult) {
      return prepareResult;
    }

    try {
      await fs.writeFile(absoluteFilePath, sideEffectResult, "utf8");
    } catch (error) {
      logError({
        shortMessage: `Failed to write file`,
        error,
      });
      return { error: `Failed to write file: ${error}` };
    }

    return { data: undefined };
  }

  private collectTemplateTreeIds(rootInstanceId: string): Set<string> {
    const idsToRemove = new Set<string>();
    const queue: string[] = [rootInstanceId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;

      if (idsToRemove.has(currentId)) {
        continue;
      }

      idsToRemove.add(currentId);

      for (const templateSetting of this.destinationProjectSettings
        .instantiatedTemplates) {
        if (templateSetting.parentId === currentId) {
          queue.push(templateSetting.id);
        }
      }
    }

    return idsToRemove;
  }

  private async removeTemplatesFromProjectSettings(
    idsToRemove: Set<string>,
    options?: { removeFromFile?: boolean },
  ): Promise<void> {
    if (idsToRemove.size === 0) {
      return;
    }

    this.destinationProjectSettings.instantiatedTemplates =
      this.destinationProjectSettings.instantiatedTemplates.filter(
        (templateSetting) => !idsToRemove.has(templateSetting.id),
      );

    if (
      this.options.dontGenerateTemplateSettings ||
      !options?.removeFromFile
    ) {
      return;
    }

    for (const id of idsToRemove) {
      const removalResult = await removeTemplateFromSettings(
        this.options.absoluteDestinationPath,
        id,
      );

      if ("error" in removalResult) {
        backendLogger.error(
          `Failed to remove template ${id} from templateSettings.json: ${removalResult.error}`,
        );
      }
    }
  }

  private async setTemplateGenerationValues(
    userSettings: UserTemplateSettings,
    template: Template,
    parentInstanceId?: string,
  ): Promise<Result<void>> {
    if (!await template.isValid()) {
      backendLogger.error(
        `Template repo is not clean or template commit hash is not valid.`,
      );
      return {
        error: `Template repo is not clean or template commit hash is not valid.`,
      };
    }

    const parsed = template.config.templateSettingsSchema
      .extend({ aiModels: z.any().optional() })
      .safeParse(userSettings);
    if (!parsed.success) {
      backendLogger.error(`Failed to parse user settings: ${parsed.error}`);
      return { error: `Failed to parse user settings: ${parsed.error}` };
    }

    let parentFinalSettings: FinalTemplateSettings | undefined;
    if (template.parentTemplate && parentInstanceId) {
      const parentRes = Project.getFinalTemplateSettingsForInstantiatedTemplate(
        template.parentTemplate,
        parentInstanceId,
        this.destinationProjectSettings,
      );
      if ("error" in parentRes) {
        return parentRes;
      }
      parentFinalSettings = parentRes.data;
    }

    const aiRes = await generateAiResults(
      template,
      parsed.data,
      parentFinalSettings,
      this.options.absoluteDestinationPath,
    );

    if ("error" in aiRes) {
      return aiRes;
    }

    const finalSettings = template.config.mapFinalSettings({
      fullProjectSettings: this.destinationProjectSettings,
      templateSettings: parsed.data,
      parentSettings: parentFinalSettings,
      aiResults: aiRes.data,
    });

    this.currentlyGeneratingTemplate = template;
    this.currentlyGeneratingTemplateParentInstanceId = parentInstanceId;
    this.currentlyGeneratingTemplateFinalSettings = finalSettings;
    this.currentAiResults = aiRes.data;

    return { data: undefined };
  }

  // TODO NOW fix instantation tree.
  private async autoInstantiateSubTemplates(
    fullParentSettings: FinalTemplateSettings,
    parentTemplateInstanceId: string,
    templatesToAutoInstantiate?: AutoInstantiatedSubtemplate[],
  ): Promise<Result<void>> {
    if (this.options.dontAutoInstantiate) {
      return { data: undefined };
    }
    if (!this.currentlyGeneratingTemplate) {
      backendLogger.error("No template is currently being generated.");
      return { error: "No template is currently being generated." };
    }

    for (const templateToAutoInstantiate of templatesToAutoInstantiate || []) {
      const autoGeneratedTemplateUserSettings = anyOrCallbackToAny(
        templateToAutoInstantiate.mapSettings,
        fullParentSettings,
      );

      if ("error" in autoGeneratedTemplateUserSettings) {
        return autoGeneratedTemplateUserSettings;
      }

      const nameOfTemplateToAutoInstantiate =
        templateToAutoInstantiate.subTemplateName;

      const templateToInstantiate =
        this.currentlyGeneratingTemplate.findSubTemplate(
          nameOfTemplateToAutoInstantiate,
        );

      if (!templateToInstantiate) {
        backendLogger.error(
          `Template ${nameOfTemplateToAutoInstantiate} not found in ${this.currentlyGeneratingTemplate.config.templateConfig.name}`,
        );
        return {
          error: `Template ${nameOfTemplateToAutoInstantiate} not found in ${this.currentlyGeneratingTemplate.config.templateConfig.name}`,
        };
      }

      if (
        !templateToInstantiate.parentTemplate ||
        templateToInstantiate.parentTemplate.config.templateConfig.name !==
        this.currentlyGeneratingTemplate.config.templateConfig.name
      ) {
        backendLogger.error(
          `Subtemplate ${templateToAutoInstantiate.subTemplateName} is not a child of template ${this.currentlyGeneratingTemplate.config.templateConfig.name}`,
        );
        return {
          error: `Subtemplate ${templateToAutoInstantiate.subTemplateName} is not a child of template ${this.currentlyGeneratingTemplate.config.templateConfig.name}`,
        };
      }

      const childFinalTemplateSettingsResult = Project.getFinalTemplateSettings(
        templateToInstantiate,
        this.destinationProjectSettings,
        autoGeneratedTemplateUserSettings.data,
        parentTemplateInstanceId,
      );

      if ("error" in childFinalTemplateSettingsResult) {
        return childFinalTemplateSettingsResult;
      }

      const childFinalTemplateSettings =
        childFinalTemplateSettingsResult.data;

      const addTemplateResult = this.addNewTemplate(
        autoGeneratedTemplateUserSettings.data,
        nameOfTemplateToAutoInstantiate,
        parentTemplateInstanceId,
        true,
      );

      if ("error" in addTemplateResult) {
        return addTemplateResult;
      }

      const savedCurrentlyGeneratingTemplate: Template =
        this.currentlyGeneratingTemplate;
      const savedCurrentlyGeneratingTemplateFullSettings =
        this.currentlyGeneratingTemplateFinalSettings;
      const savedCurrentlyGeneratingTemplateParentInstanceId =
        this.currentlyGeneratingTemplateParentInstanceId;

      const instantiateTemplateResult = await this.instantiateTemplateInProject(
        addTemplateResult.data,
        { removeOnFailure: true },
      );

      if ("error" in instantiateTemplateResult) {
        this.currentlyGeneratingTemplate = savedCurrentlyGeneratingTemplate;
        this.currentlyGeneratingTemplateFinalSettings =
          savedCurrentlyGeneratingTemplateFullSettings;
        this.currentlyGeneratingTemplateParentInstanceId =
          savedCurrentlyGeneratingTemplateParentInstanceId;
        return instantiateTemplateResult;
      }

      const childrenTemplatesToAutoInstantiate =
        templateToAutoInstantiate.children;

      if (childrenTemplatesToAutoInstantiate) {
        const autoInstantiationResult = await this.autoInstantiateSubTemplates(
          childFinalTemplateSettings,
          addTemplateResult.data,
          childrenTemplatesToAutoInstantiate,
        );

        if ("error" in autoInstantiationResult) {
          this.currentlyGeneratingTemplate = savedCurrentlyGeneratingTemplate;
          this.currentlyGeneratingTemplateFinalSettings =
            savedCurrentlyGeneratingTemplateFullSettings;
          this.currentlyGeneratingTemplateParentInstanceId =
            savedCurrentlyGeneratingTemplateParentInstanceId;
          return autoInstantiationResult;
        }
      }

      const templatesToAutoInstantiate = this.getTemplatesToAutoInstantiate();

      if ("error" in templatesToAutoInstantiate) {
        this.currentlyGeneratingTemplate = savedCurrentlyGeneratingTemplate;
        this.currentlyGeneratingTemplateFinalSettings =
          savedCurrentlyGeneratingTemplateFullSettings;
        this.currentlyGeneratingTemplateParentInstanceId =
          savedCurrentlyGeneratingTemplateParentInstanceId;
        return templatesToAutoInstantiate;
      }

      if (templatesToAutoInstantiate.data?.length) {
        const autoInstantiationResult = await this.autoInstantiateSubTemplates(
          childFinalTemplateSettings,
          addTemplateResult.data,
          templatesToAutoInstantiate.data,
        );

        if ("error" in autoInstantiationResult) {
          this.currentlyGeneratingTemplate = savedCurrentlyGeneratingTemplate;
          this.currentlyGeneratingTemplateFinalSettings =
            savedCurrentlyGeneratingTemplateFullSettings;
          this.currentlyGeneratingTemplateParentInstanceId =
            savedCurrentlyGeneratingTemplateParentInstanceId;
          return autoInstantiationResult;
        }
      }

      this.currentlyGeneratingTemplate = savedCurrentlyGeneratingTemplate;
      this.currentlyGeneratingTemplateFinalSettings =
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
      backendLogger.error(
        `Project ${this.destinationProjectSettings.projectName} already has instantiated templates.`,
      );
      return {
        error: `Project ${this.destinationProjectSettings.projectName} already has instantiated templates.`,
      };
    }

    const parsedUserSettings = this.rootTemplate.config.templateSettingsSchema
      .extend({ aiModels: z.any().optional() })
      .safeParse(userSettings);
    if (!parsedUserSettings.success) {
      backendLogger.error(
        `Failed to parse user settings: ${parsedUserSettings.error}`,
      );
      return {
        error: `Failed to parse user settings: ${parsedUserSettings.error}`,
      };
    }

    const newProjectId = newUuid || crypto.randomUUID();
    const lastMigration = latestMigrationUuid(
      this.rootTemplate.config.migrations,
    );

    this.destinationProjectSettings.instantiatedTemplates.push({
      id: newProjectId,
      templateCommitHash: this.rootTemplate.commitHash,
      templateRepoUrl: this.rootTemplate.repoUrl,
      templateBranch: this.rootTemplate.branch,
      templateName: this.rootTemplate.config.templateConfig.name,
      templateSettings: parsedUserSettings.data,
      lastMigration,
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
      backendLogger.error(
        `Template ${templateName} could not be found in rootTemplate ${this.rootTemplate.config.templateConfig.name}`,
      );
      return {
        error: `Template ${templateName} could not be found in rootTemplate ${this.rootTemplate.config.templateConfig.name}`,
      };
    }

    const parsedUserSettings = template.config.templateSettingsSchema
      .extend({ aiModels: z.any().optional() })
      .safeParse(userSettings);
    if (!parsedUserSettings.success) {
      backendLogger.error(
        `Failed to parse user settings: ${parsedUserSettings.error}`,
      );
      return {
        error: `Failed to parse user settings: ${parsedUserSettings.error}`,
      };
    }

    for (const instantiatedTemplate of this.destinationProjectSettings
      .instantiatedTemplates) {
      if (
        instantiatedTemplate.parentId === parentInstanceId &&
        instantiatedTemplate.templateName === templateName &&
        !template.config.templateConfig.multiInstance
      ) {
        backendLogger.error(`Template ${templateName} is already instantiated.`);
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
    const lastMigration = latestMigrationUuid(template.config.migrations);

    this.destinationProjectSettings.instantiatedTemplates.push({
      id: newProjectId,
      parentId: parentInstanceId,
      templateCommitHash: template.commitHash,
      templateRepoUrl: template.repoUrl,
      templateBranch: template.branch,
      automaticallyInstantiatedByParent: autoInstantiated,
      templateName,
      templateSettings: parsedUserSettings.data,
      lastMigration,
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
    options?: { removeOnFailure?: boolean },
  ): Promise<Result<string>> {
    const removeOnFailure = options?.removeOnFailure ?? false;

    const instantiatedTemplateIndex =
      this.destinationProjectSettings.instantiatedTemplates.findIndex(
        (template) => template.id === newTemplateInstanceId,
      );

    if (instantiatedTemplateIndex === -1) {
      backendLogger.error(`Template with id ${newTemplateInstanceId} not found.`);
      return { error: `Template with id ${newTemplateInstanceId} not found.` };
    }

    const instantiatedTemplate =
      this.destinationProjectSettings.instantiatedTemplates[
        instantiatedTemplateIndex
      ]!;

    const templateName = instantiatedTemplate.templateName;
    const userSettings = instantiatedTemplate.templateSettings;
    const parentInstanceId = instantiatedTemplate.parentId;

    let templateSettingsPersisted = false;
    const rollbackManager = new FileRollbackManager();

    const cleanupOnFailure = async (): Promise<void> => {
      if (!removeOnFailure) {
        return;
      }

      const idsToRemove = this.collectTemplateTreeIds(
        newTemplateInstanceId,
      );

      await this.removeTemplatesFromProjectSettings(idsToRemove, {
        removeFromFile: templateSettingsPersisted,
      });
    };

    const fail = async <T>(result: Result<T>): Promise<Result<T>> => {
      await rollbackManager.rollback();
      this.currentFileRollbackManager = undefined;
      await cleanupOnFailure();
      return result;
    };

    const failWithMessage = (message: string): Promise<Result<string>> =>
      fail({ error: message });

    if (!parentInstanceId) {
      backendLogger.error(
        `Parent instance ID is required for template ${templateName}. Maybe you are trying to instantiate the root template?`,
      );
      return failWithMessage(
        `Parent instance ID is required for template ${templateName}. Maybe you are trying to instantiate the root template?`,
      );
    }

    const template = this.rootTemplate.findSubTemplate(templateName);
    if (!template) {
      backendLogger.error(
        `Template ${templateName} could not be found in rootTemplate ${this.rootTemplate.config.templateConfig.name}`,
      );
      return failWithMessage(
        `Template ${templateName} could not be found in rootTemplate ${this.rootTemplate.config.templateConfig.name}`,
      );
    }

    const result = await this.setTemplateGenerationValues(
      userSettings,
      template,
      parentInstanceId,
    );

    if ("error" in result) {
      return fail(result);
    }

    instantiatedTemplate.aiResults = this.currentAiResults;
    // TODO: disable every other action in project page when the commithash is not equal.
    // NO actually just make sure always before generating to git checkout the right template. I guess before every generation/copydirectory we need to git checkout the right commit hash, load the template again from this the newly checked out template. Run the generation and git checkout the old branch again. This needs to happen for every generation but also when displaying the template.
    // NO maybe we will NEED to make another copy of the templates dir and checkout there so we can just retrieve templates and get all versions not only the newest. So when retrieving projects if there is a oldtemplatehash used anywhere we call a function to copy the template dir to cache. There we checkout this commit hash and we load it from there. This way we can also display the other revisions of template in frontend on templates list since they will have been added. Then we can make it so the apps requires restart if you change and recommit the templates dir because before that all templates will be loaded in memory with a commit hash and will never be loaded again. So add checks everywhere if commit hash still the same and if git dir is clean before actually generating the template. So now to uniquely identify template should use everywhere name and commit hash and when searching template you have the newest one and then all revisions used for projects. Probaly store the copied revisions in the cachedir inside a dir with the commithash as name. This way we in generation we can reference files from any revision directly to use old and new templates and also to update from old to new template. When app starts and projects are loaded will check if revisions in cache else copy dir there and checkout right revision. Add error TEMPLATE DIR CHANGED and a button to manually reload all templates and then revisions and will delete all cached revisions. This way no restart of app is needed. So the registry will fill up with revisions while app is running and when user press reload will clean and load again.
    if (!this.currentlyGeneratingTemplateFinalSettings) {
      backendLogger.error("Failed to parse user settings.");
      return failWithMessage("Failed to parse user settings.");
    }

    this.currentFileRollbackManager = rollbackManager;

    const templatesThatDisableThisTemplate = anyOrCallbackToAny(
      template.config.templatesThatDisableThis,
      this.currentlyGeneratingTemplateFinalSettings,
    );

    if ("error" in templatesThatDisableThisTemplate) {
      return fail(templatesThatDisableThisTemplate);
    }

    for (const instantiatedTemplate of this.destinationProjectSettings
      .instantiatedTemplates) {
      if (
        templatesThatDisableThisTemplate.data
          ?.filter(
            (templateThatDisableThis) =>
              !templateThatDisableThis.specificSettings ||
              isSubset(
                templateThatDisableThis.specificSettings,
                instantiatedTemplate.templateSettings,
              ),
          )
          .map(
            (templateThatDisableThis) => templateThatDisableThis.templateName,
          )
          .includes(instantiatedTemplate.templateName)
      ) {
        backendLogger.error(
          `Template ${templateName} cannot be instantiated because ${instantiatedTemplate.templateName} is already instantiated.`,
        );
        return failWithMessage(
          `Template ${templateName} cannot be instantiated because ${instantiatedTemplate.templateName} is already instantiated.`,
        );
      }
    }

    const assertions = anyOrCallbackToAny(
      template.config.assertions,
      this.currentlyGeneratingTemplateFinalSettings,
    );

    if ("error" in assertions) {
      return fail(assertions);
    }

    if (assertions.data !== undefined && !assertions.data) {
      backendLogger.error(`Template ${templateName} failed assertions.`);
      return failWithMessage(`Template ${templateName} failed assertions.`);
    }

    try {
      const copyResult = await this.copyDirectory();
      if ("error" in copyResult) {
        return fail(copyResult);
      }
      const sideEffectResult = await this.applySideEffects();
      if ("error" in sideEffectResult) {
        return fail(sideEffectResult);
      }

      this.currentFileRollbackManager = undefined;

      if (!this.options.dontGenerateTemplateSettings) {
        const newTemplateResult = await writeNewTemplateToSettings(
          this.options.absoluteDestinationPath,
          instantiatedTemplate,
        );

        if ("error" in newTemplateResult) {
          return fail(newTemplateResult);
        }

        templateSettingsPersisted = true;
      }

      const templatesToAutoInstantiate = this.getTemplatesToAutoInstantiate();

      if ("error" in templatesToAutoInstantiate) {
        return fail(templatesToAutoInstantiate);
      }

      if (templatesToAutoInstantiate.data?.length) {
        const autoInstantiationResult = await this.autoInstantiateSubTemplates(
          this.currentlyGeneratingTemplateFinalSettings,
          instantiatedTemplate.id,
          templatesToAutoInstantiate.data,
        );

        if ("error" in autoInstantiationResult) {
          return fail(autoInstantiationResult);
        }
      }
    } catch (error) {
      logError({
        shortMessage: `Failed to instantiate template`,
        error,
      });
      return fail({ error: `Failed to instantiate template: ${error}` });
    }

    rollbackManager.clear();
    this.currentFileRollbackManager = undefined;

    return this.getAbsoluteTargetPath();
  }

  /**
   * This function will add the template settings to the project settings.
   * @param newProjectName The name of the new project.
   * @returns The absolute path of the new project.
   * @throws Error if the project cannot be created.
   */
  public async instantiateNewProject(): Promise<Result<string>> {
    const instantiatedTemplate =
      this.destinationProjectSettings.instantiatedTemplates[0];
    if (!instantiatedTemplate) {
      backendLogger.error(
        `Template with id ${this.currentlyGeneratingTemplateParentInstanceId} not found.`,
      );
      return {
        error: `Template with id ${this.currentlyGeneratingTemplateParentInstanceId} not found.`,
      };
    }

    const projectRootInstanceId = instantiatedTemplate.id;

    if (
      instantiatedTemplate.templateName !==
      this.rootTemplate.config.templateConfig.name
    ) {
      backendLogger.error(
        `Root template name mismatch in project settings. Make sure root template is the first one in the list.`,
      );
      await this.removeTemplatesFromProjectSettings(
        this.collectTemplateTreeIds(projectRootInstanceId),
      );
      return {
        error: `Root template name mismatch in project settings. Make sure root template is the first one in the list.`,
      };
    }

    const template = this.rootTemplate;
    const userSettings = instantiatedTemplate.templateSettings;

    let projectDirCreated = false;
    let projectSettingsPersisted = false;
    const rollbackManager = new FileRollbackManager();

    const cleanupOnFailure = async () => {
      const idsToRemove = this.collectTemplateTreeIds(projectRootInstanceId);
      await this.removeTemplatesFromProjectSettings(idsToRemove, {
        removeFromFile: projectSettingsPersisted,
      });

      if (!projectDirCreated) {
        return;
      }

      try {
        await fs.rm(this.options.absoluteDestinationPath, {
          recursive: true,
          force: true,
        });
        projectDirCreated = false;
      } catch (error) {
        logError({
          shortMessage: `Failed to clean up project directory ${this.options.absoluteDestinationPath}`,
          error,
        });
      }
    };

    const fail = async <T>(result: Result<T>): Promise<Result<T>> => {
      await rollbackManager.rollback();
      this.currentFileRollbackManager = undefined;
      await cleanupOnFailure();
      return result;
    };

    const dirStat = await fs
      .stat(this.options.absoluteDestinationPath)
      .catch(() => null);
    if (dirStat && dirStat.isDirectory()) {
      backendLogger.error(
        `Directory ${this.options.absoluteDestinationPath} already exists.`,
      );
      return fail({
        error: `Directory ${this.options.absoluteDestinationPath} already exists.`,
      });
    }

    const result = await this.setTemplateGenerationValues(
      userSettings,
      template,
    );

    if ("error" in result) {
      return fail(result);
    }

    instantiatedTemplate.aiResults = this.currentAiResults;

    if (!this.currentlyGeneratingTemplateFinalSettings) {
      backendLogger.error("Failed to parse user settings.");
      return fail({ error: "Failed to parse user settings." });
    }

    try {
      const ensureProjectDirResult = await makeDir(
        this.options.absoluteDestinationPath,
      );

      if ("error" in ensureProjectDirResult) {
        return fail(ensureProjectDirResult);
      }
      projectDirCreated = true;
      if (!this.options.dontDoGit) {
        const createRepoResult = await createGitRepo(
          this.options.absoluteDestinationPath,
        );
        if ("error" in createRepoResult) {
          return fail(createRepoResult);
        }
      }
      if (!this.options.dontGenerateTemplateSettings) {
        const writeSettingsResult = await writeNewProjectSettings(
          this.options.absoluteDestinationPath,
          this.destinationProjectSettings,
          false,
        );
        if ("error" in writeSettingsResult) {
          return fail(writeSettingsResult);
        }
        projectSettingsPersisted = true;
      }
      if (!this.options.dontDoGit) {
        const commitResult = await commitAll(
          this.options.absoluteDestinationPath,
          `Initial commit for ${this.destinationProjectSettings.projectName}`,
        );
        if ("error" in commitResult) {
          return fail(commitResult);
        }
      }

      this.currentFileRollbackManager = rollbackManager;
      const copyResult = await this.copyDirectory();
      if ("error" in copyResult) {
        return fail(copyResult);
      }

      const sideEffectResult = await this.applySideEffects();
      if ("error" in sideEffectResult) {
        return fail(sideEffectResult);
      }

      this.currentFileRollbackManager = undefined;

      // TODO: Revise this to be able to be called recursively so add this as a param to function and use getTemplatesToAutoInstantiate. Then call this function on the children list.
      // maybe later we make sure adding every template to the projectSettings happens in the first step and then the instantiateTemplateInProject and instantiateNewProject functions can call this function which will retrieve everything from projectsettings which were already set before calling instantiateTemplateInProject and instantiateNewProject. So 2 seperate steps. Modify the templateSettings and then generate. HEre also force template to be direct child of currentlyGeneratingTemplate
      const templatesToAutoInstantiate = this.getTemplatesToAutoInstantiate();

      if ("error" in templatesToAutoInstantiate) {
        return fail(templatesToAutoInstantiate);
      }
      const result = await this.autoInstantiateSubTemplates(
        this.currentlyGeneratingTemplateFinalSettings,
        instantiatedTemplate.id,
        templatesToAutoInstantiate.data,
      );
      if ("error" in result) {
        return fail(result);
      }

      rollbackManager.clear();
    } catch (error) {
      await rollbackManager.rollback();
      this.currentFileRollbackManager = undefined;
      await cleanupOnFailure();
      logError({
        shortMessage: `Failed to instantiate new project`,
        error,
      });
      return { error: `Failed to instantiate new project: ${error}` };
    }

    return { data: this.options.absoluteDestinationPath };

  }

  /**
   * Will use the projectSettings to instantiate all templates defined.
   */
  public async instantiateFullProjectFromSettings(): Promise<
    Result<string>
  > {
    if (!this.options.dontAutoInstantiate) {
      backendLogger.error(
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
        backendLogger.error("Root template name mismatch in project settings.");
        return { error: "Root template name mismatch in project settings." };
      }

      if (this.destinationProjectSettings.instantiatedTemplates.length === 0) {
        backendLogger.error("No instantiated templates found in project settings.");
        return {
          error: "No instantiated templates found in project settings.",
        };
      }

      const projectGenerationResult = await this.instantiateNewProject();

      if ("error" in projectGenerationResult) {
        return projectGenerationResult;
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
          backendLogger.error(
            `Subtemplate ${instantiated.templateName} not found. Skipping...`,
          );
          continue;
        }

        const res = await this.instantiateTemplateInProject(instantiated.id);
        if ("error" in res) {
          return res;
        }
      }

      return { data: this.options.absoluteDestinationPath };
    } catch (error) {
      logError({
        shortMessage: `Failed to instantiate full project from settings`,
        error,
      });
      return {
        error: `Failed to instantiate full project from settings: ${error}`,
      };
    }
  }
}
