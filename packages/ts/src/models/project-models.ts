import * as fs from "node:fs/promises";
import path from "node:path";
import { ProjectDTO, ProjectSettings, ProjectSettingsSchema, Result } from "../utils/types";
import { Template } from "./template-models";
import { UserTemplateSettings } from "@timonteutelink/template-types-lib";
import { ROOT_TEMPLATE_REGISTRY } from "../services/root-template-registry-service";

// every project name inside a root project should be unique.
//
// The root project can be uniquely identified by its name and author.(and version)

export class Project {
	public absoluteRootDir: string;

	public absoluteSettingsPath: string; // path to the templateSettings.json file

	public instantiatedProjectSettings: ProjectSettings;

	public rootTemplate: Template;

	constructor(absDir: string, absSettingsPath: string, projectSettings: ProjectSettings, rootTemplate: Template) {
		this.absoluteRootDir = absDir;
		this.absoluteSettingsPath = absSettingsPath;
		this.instantiatedProjectSettings = projectSettings;
		this.rootTemplate = rootTemplate;
	}

	public static async writeNewProjectSettings(absoluteProjectPath: string, projectSettings: ProjectSettings, overwrite?: boolean): Promise<Result<void>> {
		const projectSettingsPath = path.join(absoluteProjectPath, "templateSettings.json");
		if (!overwrite) {
			try {
				await fs.access(projectSettingsPath);
				return { error: `Project settings file already exists at ${projectSettingsPath}` };
			} catch {
				// File does not exist, continue
			}
		}
		try {
			await fs.mkdir(absoluteProjectPath, { recursive: true });
			const serializedProjectSettings = JSON.stringify(projectSettings, null, 2);
			await fs.writeFile(projectSettingsPath, serializedProjectSettings, "utf-8");
		} catch (error) {
			return { error: `Failed to write templateSettings.json: ${error}` };
		}
		return { data: undefined };
	}

	public static async addTemplateToSettings(absoluteProjectPath: string, parentInstanceId: string, template: Template, templateSettings: UserTemplateSettings): Promise<Result<void>> {
		const projectSettingsPath = path.join(absoluteProjectPath, "templateSettings.json");
		const projectSettingsResult = await Project.loadProjectSettings(projectSettingsPath);
		if ('error' in projectSettingsResult) {
			return { error: projectSettingsResult.error };
		}
		const projectSettings = projectSettingsResult.data.settings;
		projectSettings.instantiatedTemplates.push({
			id: crypto.randomUUID(),
			parentId: parentInstanceId,
			templateName: template.config.templateConfig.name,
			templateSettings,
		});
		const result = await Project.writeNewProjectSettings(absoluteProjectPath, projectSettings, true);
		if ('error' in result) {
			return { error: result.error };
		}

		return { data: undefined };
	}

	private static async loadProjectSettings(projectSettingsPath: string): Promise<Result<{ settings: ProjectSettings, rootTemplate: Template }>> {
		const projectSettings = await fs.readFile(projectSettingsPath, "utf-8");
		const parsedProjectSettings = JSON.parse(projectSettings);
		const finalProjectSettings = ProjectSettingsSchema.safeParse(parsedProjectSettings);
		if (!finalProjectSettings.success) {
			return { error: `Invalid templateSettings.json: ${finalProjectSettings.error}` }
		}
		const rootTemplate = await ROOT_TEMPLATE_REGISTRY.findTemplate(finalProjectSettings.data.rootTemplateName);
		if ('error' in rootTemplate) {
			return { error: rootTemplate.error };
		}

		for (const subTemplateSettings of finalProjectSettings.data.instantiatedTemplates) {
			const subTemplate = rootTemplate.data.findSubTemplate(subTemplateSettings.templateName);
			if (!subTemplate) {
				return {
					error: `Template ${subTemplateSettings.templateName} not found in root template ${finalProjectSettings.data.rootTemplateName}`,
				}
			}

			const subTemplateSettingsSchema = subTemplate.config.templateSettingsSchema.safeParse(subTemplateSettings.templateSettings);
			if (!subTemplateSettingsSchema.success) {
				return { error: `Invalid templateSettings.json for template ${subTemplateSettings.templateName}: ${subTemplateSettingsSchema.error}` }
			}
		}

		const instantiatedProjectSettings = {
			settings: finalProjectSettings.data,
			rootTemplate: rootTemplate.data,
		};
		return { data: instantiatedProjectSettings };
	}

	/**
	 * Aggregates all settings of the provided template and all parent templates inside of this project. If the template or any of the parents are not initialized in this project return an empty object
	 * can be called recursively with parent templates to assemble a final object of all templates up to the root template.
	 */
	getInstantiatedSettings(template: Template, instanceId: string): UserTemplateSettings {
		const instantiatedSettings: UserTemplateSettings = {};
		const projectTemplateSettings = this.instantiatedProjectSettings.instantiatedTemplates.find(t => t.id === instanceId && t.templateName === template.config.templateConfig.name);
		if (!projectTemplateSettings) {
			return instantiatedSettings;
		}
		instantiatedSettings[template.config.templateConfig.name] = template.config.templateSettingsSchema.parse(projectTemplateSettings.templateSettings);

		const parentTemplate = template.parentTemplate;
		if (parentTemplate && projectTemplateSettings.parentId) {
			const parentSettings = this.getInstantiatedSettings(parentTemplate, projectTemplateSettings.parentId);
			Object.assign(instantiatedSettings, parentSettings);
		}
		return instantiatedSettings;
	}

	static async create(absDir: string): Promise<Result<Project>> {
		const projectSettingsPath = path.join(absDir, "templateSettings.json");
		const projectSettings = await Project.loadProjectSettings(projectSettingsPath);
		if ('error' in projectSettings) {
			return { error: projectSettings.error };
		}
		return { data: new Project(absDir, projectSettingsPath, projectSettings.data.settings, projectSettings.data.rootTemplate) };
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

