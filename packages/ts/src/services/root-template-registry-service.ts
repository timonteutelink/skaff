import * as fs from 'node:fs/promises';
import { Template } from '../models/template-models';
import { TEMPLATE_PATHS } from '../utils/env';

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

	async findTemplate(templateName: string): Promise<Template | null> {
		if (!this.templates.length) {
			await this.loadTemplates();
			if (!this.templates.length) {
				console.error("No templates found.");
				return null;
			}
		}

		for (const template of this.templates) {
			if (template.config.templateConfig.name === templateName) {
				return template;
			}
		}
		return null;
	}

}

export const ROOT_TEMPLATE_REGISTRY = new RootTemplateRegistry(TEMPLATE_PATHS);

