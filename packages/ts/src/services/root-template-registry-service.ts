import * as fs from 'node:fs/promises';
import { Template } from '../models/template-models';
import { TEMPLATE_PATHS } from '../utils/env';

export class RootTemplateRegistry {
	public templates: Template[] = [];

	constructor(private templatePaths: string[]) { }

	async loadTemplates(): Promise<void> {
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
}

export const ROOT_TEMPLATE_REGISTRY = new RootTemplateRegistry(TEMPLATE_PATHS);

