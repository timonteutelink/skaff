import fs from "fs-extra";

import { ProjectSettings } from "@timonteutelink/template-types-lib";

import { Result } from "../../lib/types";
import { Project } from "../../models/project";
import { ProjectCreationManager } from "../projects/ProjectCreationManager";
import { DiffCache } from "./DiffCache";
import { getSkaffContainer } from "../../di/container";
import { inject, injectable } from "tsyringe";
import {
  DiffCacheToken,
  ProjectCreationManagerToken,
  TemporaryProjectFactoryToken,
} from "../../di/tokens";

interface TemporaryProject {
  path: string;
  cleanup: () => Promise<void>;
}

@injectable()
export class TemporaryProjectFactory {
  constructor(
    @inject(DiffCacheToken)
    private readonly cache: DiffCache,
    @inject(ProjectCreationManagerToken)
    private readonly manager: ProjectCreationManager,
  ) {}

  public async createFromSettings(
    projectSettings: ProjectSettings,
    cacheKey: string,
  ): Promise<Result<TemporaryProject>> {
    const tempPathResult = await this.cache.resolveTempPath(cacheKey);
    if ("error" in tempPathResult) {
      return tempPathResult;
    }

    const cleanup = async () => {
      await fs.rm(tempPathResult.data, { recursive: true, force: true });
    };

    const generationResult = await this.manager.generateFromTemplateSettings(
      projectSettings,
      tempPathResult.data,
      { git: false },
    );

    if ("error" in generationResult) {
      await cleanup();
      return generationResult;
    }

    return {
      data: {
        path: tempPathResult.data,
        cleanup,
      },
    };
  }

  public async createFromExistingProject(
    project: Project,
    cacheKey: string,
  ): Promise<Result<TemporaryProject>> {
    const tempPathResult = await this.cache.resolveTempPath(cacheKey);
    if ("error" in tempPathResult) {
      return tempPathResult;
    }

    const cleanup = async () => {
      await fs.rm(tempPathResult.data, { recursive: true, force: true });
    };

    const generationResult = await this.manager.generateFromExistingProject(
      project,
      tempPathResult.data,
      { git: false },
    );

    if ("error" in generationResult) {
      await cleanup();
      return generationResult;
    }

    return {
      data: {
        path: tempPathResult.data,
        cleanup,
      },
    };
  }
}

export function resolveTemporaryProjectFactory(): TemporaryProjectFactory {
  return getSkaffContainer().resolve(TemporaryProjectFactoryToken);
}
