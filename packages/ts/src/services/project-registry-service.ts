import * as fs from 'node:fs/promises';
import { PROJECT_SEARCH_PATHS } from '../utils/env';
import { Project } from '../models/project-models';
import path from 'node:path';

export class ProjectRegistry {
	public projects: Project[] = [];

	constructor(private searchPaths: string[]) { }

	async loadTemplates(): Promise<void> {
		for (const searchPath of this.searchPaths) {
			const dirs = await fs.readdir(searchPath);
			for (const dir of dirs) {
				const absDir = path.join(searchPath, dir);
				const stat = await fs.stat(absDir);
				const templateSettingsPath = path.join(absDir, "templateSettings.json");
				const templateSettingsStat = await fs.stat(templateSettingsPath).catch(() => null);

				if (stat.isDirectory() && templateSettingsStat && templateSettingsStat.isFile()) {
					try {
						const project = await Project.create(absDir);
						this.projects.push(project);
					} catch (e) {
						console.error(`Failed to load project at ${absDir}: ${e}`);
						continue;
					}
				}
			}

		}
	}
}

export const PROJECT_REGISTRY = new ProjectRegistry(PROJECT_SEARCH_PATHS);

