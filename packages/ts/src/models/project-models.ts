import * as fs from "node:fs/promises";
import path from "node:path";
import z from 'zod';

const ProjectSettingsSchema = z.object({
	rootTemplateName: z.string().min(1),
	rootTemplateAuthor: z.string().min(1),

	instantiatedTemplates: z.array(z.object({
		templateName: z.string().min(1),
		templateSettings: z.any() //UserTemplateSettings
	}))
});

type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

// every template name inside a root template should be unique.
//
// The root template can be uniquely identified by its name and author.(and version)

export class Project {
	public absoluteRootDir: string;

	public absoluteSettingsPath: string; // path to the templateSettings.json file

	public instantiatedTemplateSettings: ProjectSettings;

	constructor(absDir: string, absSettingsPath: string, templateSettings: ProjectSettings) {
		this.absoluteRootDir = absDir;
		this.absoluteSettingsPath = absSettingsPath;
		this.instantiatedTemplateSettings = templateSettings;
	}

	private static async loadTemplateSettings(templateSettingsPath: string): Promise<ProjectSettings> {
		const templateSettings = await fs.readFile(templateSettingsPath, "utf-8");
		const parsedTemplateSettings = JSON.parse(templateSettings);
		const result = ProjectSettingsSchema.safeParse(parsedTemplateSettings);
		if (!result.success) {
			throw new Error(`Invalid templateSettings.json: ${result.error}`);
		}
		return result.data;
	}

	static async create(absDir: string) {
		const templateSettingsPath = path.join(absDir, "templateSettings.json");
		const templateSettings = await Project.loadTemplateSettings(templateSettingsPath);
		return new Project(absDir, templateSettingsPath, templateSettings);
	}
}

