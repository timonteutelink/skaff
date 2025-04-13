import * as fs from "node:fs/promises";
import { PROJECT_SEARCH_PATHS } from "../utils/env";
import { Project } from "../models/project-models";
import path from "node:path";

export class ProjectRegistry {
  public projects: Project[] = [];

  constructor(private searchPaths: string[]) {}

  private async loadProjects(): Promise<void> {
    for (const searchPath of this.searchPaths) {
      const dirs = await fs.readdir(searchPath);
      for (const dir of dirs) {
        const absDir = path.join(searchPath, dir);
        const stat = await fs.stat(absDir);
        const projectSettingsPath = path.join(absDir, "templateSettings.json");
        const projectSettingsStat = await fs
          .stat(projectSettingsPath)
          .catch(() => null);

        if (
          stat.isDirectory() &&
          projectSettingsStat &&
          projectSettingsStat.isFile()
        ) {
          const project = await Project.create(absDir);
          if ("error" in project) {
            console.error(
              `Failed to load project at ${absDir}: ${project.error}`,
            );
            continue;
          }
          this.projects.push(project.data);
        }
      }
    }
  }

  async reloadProjects(): Promise<void> {
    this.projects = [];
    await this.loadProjects();
  }

  async getProjects(): Promise<Project[]> {
    if (!this.projects.length) {
      await this.loadProjects();
      if (!this.projects.length) {
        console.error("No projects found.");
        return [];
      }
    }
    return this.projects;
  }

  async findProject(projectName: string): Promise<Project | null> {
    if (!this.projects.length) {
      await this.loadProjects();
      if (!this.projects.length) {
        console.error("No projects found.");
        return null;
      }
    }

    for (const project of this.projects) {
      if (project.instantiatedProjectSettings.projectName === projectName) {
        return project;
      }
    }
    return null;
  }
}

export const PROJECT_REGISTRY = new ProjectRegistry(PROJECT_SEARCH_PATHS);
