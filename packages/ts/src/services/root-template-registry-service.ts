import * as fs from 'node:fs/promises';
import { Template } from '../models/template-models';
import { TEMPLATE_PATHS } from '../utils/env';
import { Result } from '../utils/types';

export class RootTemplateRegistry {
	public templates: Template[] = [];

	constructor(private templatePaths: string[]) { }

	private async loadTemplates(): Promise<void> {
		for (const searchPath of this.templatePaths) {
			const stat = await fs.stat(searchPath);
			if (stat.isDirectory()) {
				try {
					const template = await Template.createAllTemplates(searchPath);
					this.templates.push(template);
				} catch (e) {
					console.error(`Failed to load template at ${searchPath}: ${e}`);
					continue;
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

export const ROOT_TEMPLATE_REGISTRY = new RootTemplateRegistry(TEMPLATE_PATHS);

