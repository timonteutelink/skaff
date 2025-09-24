import path from "node:path";

import { backendLogger } from "../../lib/logger";
import { Result } from "../../lib/types";
import { stringOrCallbackToString } from "../../lib/utils";
import { GenerationContext } from "./GenerationContext";

export class PathResolver {
  constructor(
    private readonly absoluteDestinationPath: string,
    private readonly context: GenerationContext,
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
      backendLogger.error(errorMessage);
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
      backendLogger.error(errorMessage);
      return { error: errorMessage };
    }

    return { data: normalizedTargetPath };
  }
}
