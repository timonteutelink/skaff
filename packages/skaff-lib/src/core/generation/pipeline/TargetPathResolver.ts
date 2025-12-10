import path from "node:path";
import { Result } from "../../../lib/types";
import { stringOrCallbackToString } from "../../../lib/utils";
import { TemplatePipelineContext } from "./TemplatePipelineContext";

/**
 * Resolves template-defined paths relative to the pipeline destination root.
 *
 * This resolver prevents templates from escaping the project directory and
 * centralizes the logic for translating relative target paths into absolute
 * filesystem locations consumed by later pipeline stages.
 */
export class TargetPathResolver {
  constructor(
    private readonly absoluteDestinationPath: string,
    private readonly context: TemplatePipelineContext,
  ) {}

  public getProjectRoot(): string {
    return path.resolve(this.absoluteDestinationPath);
  }

  public getTargetPath(): Result<string> {
    const stateResult = this.context.getState();

    if ("error" in stateResult) {
      return stateResult;
    }

    const targetPath = stateResult.data.template.config.targetPath;

    if (!targetPath) {
      return { data: "." };
    }

    const resolvedTargetPath = stringOrCallbackToString(
      targetPath,
      stateResult.data.finalSettings,
    );

    if ("error" in resolvedTargetPath) {
      return resolvedTargetPath;
    }

    return { data: resolvedTargetPath.data };
  }

  public getAbsoluteTargetPath(): Result<string> {
    const targetPathResult = this.getTargetPath();

    if ("error" in targetPathResult) {
      return targetPathResult;
    }

    return this.resolveWithinDestinationRoot(targetPathResult.data);
  }

  public resolveWithinDestinationRoot(relativePath: string): Result<string> {
    if (path.isAbsolute(relativePath)) {
      const errorMessage =
        `Absolute paths are not allowed inside templates: ${relativePath}`;
      return { error: errorMessage };
    }

    const normalizedRelativePath = path.normalize(relativePath);
    const absolutePath = path.resolve(
      this.absoluteDestinationPath,
      normalizedRelativePath,
    );

    return this.ensurePathWithinProjectRoot(absolutePath);
  }

  public ensurePathWithinProjectRoot(absolutePath: string): Result<string> {
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
      return { error: errorMessage };
    }

    return { data: normalizedTargetPath };
  }
}
