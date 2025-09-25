import { SideEffectFunction } from "@timonteutelink/template-types-lib";
import fs from "fs-extra";
import { readFile } from "node:fs/promises";
import { backendLogger } from "../../lib/logger";
import { Result } from "../../lib/types";
import { anyOrCallbackToAny, logError } from "../../lib/utils";
import { GenerationContext } from "./GenerationContext";
import { PathResolver } from "./PathResolver";
import { RollbackFileSystem } from "./RollbackFileSystem";

export class SideEffectExecutor {
  constructor(
    private readonly context: GenerationContext,
    private readonly pathResolver: PathResolver,
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
        sideEffect.apply,
      );

      if ("error" in applyResult) {
        return applyResult;
      }
    }

    return { data: undefined };
  }

  public async applySideEffect(
    filePath: string,
    sideEffectFunction: SideEffectFunction,
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

    let oldFileContents = "";
    try {
      oldFileContents = await readFile(absoluteFilePath, { encoding: "utf8" });
    } catch {
      // ignore, file may not exist yet
    }

    let sideEffectResult: string | null | undefined;
    try {
      sideEffectResult = await sideEffectFunction(
        stateResult.data.finalSettings,
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
      backendLogger.debug(
        `Side effect function returned null. Skipping file write.`,
      );
      return { data: undefined };
    }

    const prepareResult = await this.fileSystem.prepareFileForWrite(
      absoluteFilePath,
    );
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
}
