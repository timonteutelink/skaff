import * as fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../lib/logger";
import { Result } from "../lib/types";
import { Project } from "../models/project";

export class ProjectRepository {
	private loading: boolean = false;
	private searchPaths: string[] = [];
	public projects: Project[] = [];

	constructor(searchPaths: string[]) {
		this.searchPaths = searchPaths;
	}

	private async loadProjects(): Promise<Result<void>> {
		if (this.loading) {
			return { error: "Projects are already loading" };
		}
		this.loading = true;
		this.projects = [];
		for (const searchPath of this.searchPaths) {
			let dirs: string[] = [];
			try {
				dirs = await fs.readdir(searchPath);
			} catch (error) {
				logger.warn(
					{ error },
					`Failed to read project directories at ${searchPath}`,
				);
				continue;
			}
			for (const dir of dirs) {
				const absDir = path.join(searchPath, dir);
				const projectSettingsPath = path.join(absDir, "templateSettings.json");

				try {
					const stat = await fs.stat(absDir);
					const projectSettingsStat = await fs.stat(projectSettingsPath);

					if (stat.isDirectory() && projectSettingsStat.isFile()) {
						const project = await Project.create(absDir);
						if ("error" in project) {
							continue;
						}
						this.projects.push(project.data);
					}
				} catch (error) {
					continue;
				}
			}
		}
		this.loading = false;
		return { data: undefined };
	}

	async reloadProjects(): Promise<Result<void>> {
		this.projects = [];
		return await this.loadProjects();
	}

	async getProjects(): Promise<Result<Project[]>> {
		if (!this.projects.length) {
			const result = await this.loadProjects();
			if ("error" in result) {
				return result;
			}
			if (!this.projects.length) {
				return { data: [] };
			}
		}
		return { data: this.projects };
	}

	async findProject(projectName: string): Promise<Result<Project | null>> {
		if (!this.projects.length) {
			const result = await this.loadProjects();
			if ("error" in result) {
				return result;
			}
			if (!this.projects.length) {
				return { data: null };
			}
		}

		for (const project of this.projects) {
			if (project.instantiatedProjectSettings.projectName === projectName) {
				return { data: project };
			}
		}
		return { data: null };
	}
}

