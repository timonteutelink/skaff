import * as fs from 'node:fs/promises';
import { Template } from '../models/template-models';
import { TEMPLATE_SEARCH_PATHS } from '../utils/env';

export class RootTemplateRegistry {
	public templates: Template[] = [];

	constructor(private searchPaths: string[]) { }

	async loadTemplates(): Promise<void> {
		for (const searchPath of this.searchPaths) {
			const stat = await fs.stat(searchPath);
			if (stat.isDirectory()) {
				const template = await Template.createAllTemplates(searchPath);
				this.templates.push(template);
			}
		}
	}
}

export const ROOT_TEMPLATE_REGISTRY = new RootTemplateRegistry(TEMPLATE_SEARCH_PATHS);

