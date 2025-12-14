import {
  AllowOverwrite,
  RedirectFile,
} from "@timonteutelink/template-types-lib";
import fs from "fs-extra";
import { glob } from "glob";
import { HelperDelegate } from "handlebars";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { backendLogger } from "../../../lib/logger";
import { Result } from "../../../lib/types";
import { anyOrCallbackToAny, logError } from "../../../lib/utils";
import { HandlebarsEnvironment } from "../../shared/HandlebarsEnvironment";
import { RollbackFileSystem } from "../RollbackFileSystem";
import { TargetPathResolver } from "./TargetPathResolver";
import { TemplatePipelineContext } from "./TemplatePipelineContext";

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

/**
 * Renders template files into the target path for the current pipeline state.
 *
 * The materializer prepares Handlebars helpers/partials, resolves redirects and
 * overwrite rules, and copies assets to the destination directory tracked by
 * the {@link TemplatePipelineContext}. It is used by both project creation and
 * template instantiation stages to ensure file output stays consistent across
 * pipeline runs.
 */
export class TemplateFileMaterializer {
  constructor(
    private readonly context: TemplatePipelineContext,
    private readonly pathResolver: TargetPathResolver,
    private readonly fileSystem: RollbackFileSystem,
    private readonly handlebars: HandlebarsEnvironment,
    private readonly pluginHelpersProvider?: () =>
      | Record<string, HelperDelegate>
      | undefined,
  ) {}

  private getRedirects(): Result<RedirectFile[]> {
    const stateResult = this.context.getState();

    if ("error" in stateResult) {
      return stateResult;
    }

    const redirects = anyOrCallbackToAny(
      stateResult.data.template.config.redirects,
      stateResult.data.finalSettings,
    );

    if ("error" in redirects) {
      return redirects;
    }

    return { data: redirects.data ?? [] };
  }

  private getOverwrites(): Result<AllowOverwrite[]> {
    const stateResult = this.context.getState();

    if ("error" in stateResult) {
      return stateResult;
    }

    const overwrites = anyOrCallbackToAny(
      stateResult.data.template.config.allowedOverwrites,
      stateResult.data.finalSettings,
    );

    if ("error" in overwrites) {
      return overwrites;
    }

    return { data: overwrites.data ?? [] };
  }

  private getHandlebarHelpers(): Result<Record<string, HelperDelegate>> {
    const stateResult = this.context.getState();

    if ("error" in stateResult) {
      return stateResult;
    }

    const templateHelpers =
      stateResult.data.template.config.handlebarHelpers || {};
    const pluginHelpers = this.pluginHelpersProvider?.() ?? {};

    for (const helperName of Object.keys(pluginHelpers)) {
      if (helperName in templateHelpers) {
        return {
          error: `Handlebars helper ${helperName} is already defined by the template and cannot be overridden by a plugin.`,
        };
      }
    }

    return { data: { ...pluginHelpers, ...templateHelpers } };
  }

  private registerHandlebarHelpers(
    helpers: Record<string, HelperDelegate>,
    unregister?: boolean,
  ): Result<void> {
    if (unregister) {
      this.handlebars.unregisterHelpers(Object.keys(helpers));
      return { data: undefined };
    }

    this.handlebars.registerHelpers(helpers);

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
    const stateResult = this.context.getState();

    if ("error" in stateResult) {
      return stateResult;
    }

    const templatePartials = await stateResult.data.template.findAllPartials();

    if ("error" in templatePartials) {
      return templatePartials;
    }

    if (unregister) {
      this.handlebars.unregisterPartials(Object.keys(templatePartials.data));

      return { data: undefined };
    }

    const partialFiles = await this.loadPartialFiles(templatePartials.data);

    if ("error" in partialFiles) {
      return partialFiles;
    }

    this.handlebars.registerPartials(partialFiles.data);

    return { data: undefined };
  }

  public async copyTemplateDirectory(): Promise<Result<void>> {
    const stateResult = this.context.getState();

    if ("error" in stateResult) {
      return stateResult;
    }

    const src = stateResult.data.template.absoluteFilesDir;
    const dest = this.pathResolver.getAbsoluteTargetPath();

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

    const ensureDestDirResult = await this.fileSystem.ensureDirectory(dest.data);

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

      const normalizedDestPath = this.pathResolver.ensurePathWithinProjectRoot(
        destPath,
      );

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
              backendLogger.error(
                `File: ${entry} at ${finalDestinationPath} already exists.`,
              );
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
        } catch {
          // File does not exist yet.
        }

        const prepareResult = await this.fileSystem.prepareFileForWrite(
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
          const compiled = this.handlebars.compile(
            fileBuffer.toString("utf-8"),
          );

          const compilationResult = compiled(stateResult.data.finalSettings);
          await fs.writeFile(finalDestinationPath, compilationResult, "utf-8");
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
}
