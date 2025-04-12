import * as fs from 'node:fs/promises';
import { Template } from '../models/template-models';
import { TEMPLATE_DIR_PATHS } from '../utils/env';
import { Result } from '../utils/types';
import path from 'node:path';

// now only stores the root templates at: <templateDirPath>/root-templates/*
// later also store reference to files and generic templates to allow direct instantiation without saving state of subtemplates
export class RootTemplateRegistry {
	public templatePaths: string[] = [];
	public templates: Template[] = [];

	constructor(templatePaths: string[]) {
		this.templatePaths = templatePaths;
	}

	private async loadTemplates(): Promise<void> {
		for (const templatePath of this.templatePaths) {
			const rootTemplateDirsPath = path.join(templatePath, "root-templates");
			const rootTemplateDirs = await fs.readdir(rootTemplateDirsPath);
			for (const rootTemplateDir of rootTemplateDirs) {
				const stat = await fs.stat(rootTemplateDir);
				if (stat.isDirectory()) {
					try {
						const template = await Template.createAllTemplates(rootTemplateDir);
						this.templates.push(template);
					} catch (e) {
						console.error(`Failed to load template at ${rootTemplateDir}: ${e}`);
						continue;
					}
				}
			}
		}
	}

	async reloadTemplates(): Promise<void> {
		this.templates = [];
		await this.loadTemplates();
	}

	async getTemplates(): Promise<Template[]> {
		if (!this.templates.length) {
			await this.loadTemplates();
			if (!this.templates.length) {
				console.error("No templates found.");
				return [];
			}
		}
		return this.templates;
	}

	async findTemplate(templateName: string): Promise<Result<Template>> {
		if (!this.templates.length) {
			await this.loadTemplates();
			if (!this.templates.length) {
				console.error("No templates found.");
				return { error: "No templates found." };
			}
		}

		for (const template of this.templates) {
			if (template.config.templateConfig.name === templateName) {
				return { data: template };
			}
		}
		return { error: `Template ${templateName} not found` };
	}

}

export const ROOT_TEMPLATE_REGISTRY = new RootTemplateRegistry(TEMPLATE_DIR_PATHS);

