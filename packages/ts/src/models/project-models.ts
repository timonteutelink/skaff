import * as fs from "node:fs/promises";
import path from "node:path";
import { ProjectDTO, ProjectSettings, ProjectSettingsSchema } from "../utils/types";

// every project name inside a root project should be unique.
//
// The root project can be uniquely identified by its name and author.(and version)

export class Project {
	public absoluteRootDir: string;

	public absoluteSettingsPath: string; // path to the templateSettings.json file

	public instantiatedProjectSettings: ProjectSettings;

	constructor(absDir: string, absSettingsPath: string, projectSettings: ProjectSettings) {
		this.absoluteRootDir = absDir;
		this.absoluteSettingsPath = absSettingsPath;
		this.instantiatedProjectSettings = projectSettings;
	}

	private static async loadProjectSettings(projectSettingsPath: string): Promise<ProjectSettings> {
		const projectSettings = await fs.readFile(projectSettingsPath, "utf-8");
		const parsedProjectSettings = JSON.parse(projectSettings);
		const result = ProjectSettingsSchema.safeParse(parsedProjectSettings);
		if (!result.success) {
			throw new Error(`Invalid templateSettings.json: ${result.error}`);
		}
		return result.data;
	}

	static async create(absDir: string) {
		const projectSettingsPath = path.join(absDir, "templateSettings.json");
		const projectSettings = await Project.loadProjectSettings(projectSettingsPath);
		return new Project(absDir, projectSettingsPath, projectSettings);
	}

	public mapToDTO(): ProjectDTO {
		return {
			name: this.instantiatedProjectSettings.projectName,
			absPath: this.absoluteRootDir,
			rootTemplateName: this.instantiatedProjectSettings.rootTemplateName,
			settings: this.instantiatedProjectSettings
		}
	}
}

