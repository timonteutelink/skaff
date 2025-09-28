import * as fs from "node:fs/promises";
import path from "node:path";
import { injectable } from "tsyringe";

import { backendLogger } from "../lib/logger";
import { Result } from "../lib/types";
import { Project } from "../models/project";
import { logError } from "../lib";

@injectable()
export class ProjectRepository {
  private projectsCache: Map<string, Project> = new Map();

  constructor() { }

  private async loadProjectFromPath(projectPath: string): Promise<Result<Project>> {
    try {
      const settingsPath = path.join(projectPath, "templateSettings.json");
      const [dirStat, settingsStat] = await Promise.all([
        fs.stat(projectPath),
        fs.stat(settingsPath),
      ]);

      if (!dirStat.isDirectory() || !settingsStat.isFile()) {
        return { error: "Invalid project directory or missing settings file." };
      }

      const projectResult = await Project.create(projectPath);
      if ("error" in projectResult) {
        return { error: projectResult.error };
      }

      return { data: projectResult.data };
    } catch (error) {
      backendLogger.debug(`Failed to load project from path ${projectPath}`, error);
      return { error: "Failed to load project due to an error." };
    }
  }

  async loadProject(
    projectPath: string,
    cached: boolean = false,
  ): Promise<Result<Project>> {
    if (cached && this.projectsCache.has(projectPath)) {
      return { data: this.projectsCache.get(projectPath)! };
    }

    const result = await this.loadProjectFromPath(projectPath);
    if ("data" in result) {
      this.projectsCache.set(projectPath, result.data);
    }
    return result;
  }

  async findProjectByName(
    searchPath: string,
    projectName: string,
    cached: boolean = false,
  ): Promise<Result<Project | null>> {
    const projectPath = path.join(searchPath, projectName);

    try {
      const stat = await fs.stat(projectPath);
      if (!stat.isDirectory()) {
        return { data: null };
      }
    } catch (error) {
      logError({ level: 'debug', error, shortMessage: `Project path ${projectPath} does not exist.` });
      return { data: null };
    }

    if (cached && this.projectsCache.has(projectPath)) {
      return { data: this.projectsCache.get(projectPath)! };
    }

    const result = await this.loadProjectFromPath(projectPath);
    if ("data" in result) {
      this.projectsCache.set(projectPath, result.data);
      return { data: result.data };
    }

    return { data: null };
  }

  async findProjects(searchPath: string): Promise<Result<Project[]>> {
    try {
      const entries = await fs.readdir(searchPath, { withFileTypes: true });
      const projects: Project[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const projectPath = path.join(searchPath, entry.name);
          const projectResult = await this.loadProjectFromPath(projectPath);
          if ("data" in projectResult) {
            projects.push(projectResult.data);
          }
        }
      }

      return { data: projects };
    } catch (error) {
      backendLogger.warn(`Failed to find projects in path ${searchPath}`, error);
      return { error: "Failed to find projects due to an error." };
    }
  }

  async clearCache(projectPath?: string): Promise<void> {
    if (projectPath) {
      this.projectsCache.delete(projectPath);
    } else {
      this.projectsCache.clear();
    }
  }
}

