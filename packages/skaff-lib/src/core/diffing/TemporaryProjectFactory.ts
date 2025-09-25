import fs from "fs-extra";

import { ProjectSettings } from "@timonteutelink/template-types-lib";

import { Result } from "../../lib/types";
import { Project } from "../../models/project";
import { ProjectCreationManager } from "../projects/ProjectCreationManager";
import { DiffCache } from "./DiffCache";

interface TemporaryProject {
  path: string;
  cleanup: () => Promise<void>;
}

export class TemporaryProjectFactory {
  private readonly manager = new ProjectCreationManager({ git: false });

  constructor(private readonly cache = new DiffCache()) {}

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
