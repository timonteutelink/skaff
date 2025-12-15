import {
  SideEffectTransform,
  SideEffectInput,
} from "@timonteutelink/template-types-lib";
import fs from "fs-extra";
import { readFile } from "node:fs/promises";
import { backendLogger } from "../../../lib/logger";
import { Result } from "../../../lib/types";
import { anyOrCallbackToAny, logError } from "../../../lib/utils";
import { RollbackFileSystem } from "../RollbackFileSystem";
import { TargetPathResolver } from "./TargetPathResolver";
import { TemplatePipelineContext } from "./TemplatePipelineContext";
import { resolveHardenedSandbox } from "../../infra/hardened-sandbox";

/**
 * Applies side-effect functions after template files are rendered.
 *
 * The coordinator resolves the target paths using the current pipeline context
 * and ensures files are prepared for rollback. It is used as a pipeline stage
 * to mutate generated files according to template-provided callbacks.
 *
 * Side effect transforms are executed in the hardened sandbox to ensure
 * template code cannot perform I/O or access system resources directly.
 * The transform functions are pure - they receive input and return output,
 * and the host performs actual file writes.
 */
export class SideEffectCoordinator {
  constructor(
    private readonly context: TemplatePipelineContext,
    private readonly pathResolver: TargetPathResolver,
    private readonly fileSystem: RollbackFileSystem,
  ) {}

  public async applySideEffects(): Promise<Result<void>> {
    const stateResult = this.context.getState();

    if ("error" in stateResult) {
      return stateResult;
    }

    const sideEffects = anyOrCallbackToAny(
      stateResult.data.template.config.sideEffects,
      stateResult.data.finalSettings,
    );

    if ("error" in sideEffects) {
      return sideEffects;
    }

    for (const sideEffect of sideEffects.data || []) {
      const applyResult = await this.applySideEffect(
        sideEffect.filePath,
        sideEffect.transform,
      );

      if ("error" in applyResult) {
        return applyResult;
      }
    }

    return { data: undefined };
  }

  public async applySideEffect(
    filePath: string,
    transformFn: SideEffectTransform,
  ): Promise<Result<void>> {
    const stateResult = this.context.getState();

    if ("error" in stateResult) {
      return stateResult;
    }

    const absoluteFilePathResult =
      this.pathResolver.resolveWithinDestinationRoot(filePath);

    if ("error" in absoluteFilePathResult) {
      return absoluteFilePathResult;
    }

    const absoluteFilePath = absoluteFilePathResult.data;

    let existingContents: string | undefined;
    try {
      existingContents = await readFile(absoluteFilePath, { encoding: "utf8" });
    } catch {
      // File doesn't exist yet, existingContents stays undefined
    }

    // Build the input for the pure transform function
    const transformInput: SideEffectInput = {
      templateSettings: stateResult.data.finalSettings,
      existingContents,
    };

    // Execute the transform in the hardened sandbox
    let transformResult: string | null;
    try {
      const sandbox = resolveHardenedSandbox();
      transformResult = sandbox.invokeFunction(transformFn, transformInput);
    } catch (error) {
      logError({
        shortMessage: `Failed to apply side effect transform`,
        error,
      });
      return { error: `Failed to apply side effect: ${error}` };
    }

    if (transformResult === null) {
      backendLogger.debug(
        `Side effect transform returned null. Skipping file write.`,
      );
      return { data: undefined };
    }

    const prepareResult =
      await this.fileSystem.prepareFileForWrite(absoluteFilePath);
    if ("error" in prepareResult) {
      return prepareResult;
    }

    // Host performs the actual file write
    try {
      await fs.writeFile(absoluteFilePath, transformResult, "utf8");
    } catch (error) {
      logError({
        shortMessage: `Failed to write file`,
        error,
      });
      return { error: `Failed to write file: ${error}` };
    }

    return { data: undefined };
  }
}
