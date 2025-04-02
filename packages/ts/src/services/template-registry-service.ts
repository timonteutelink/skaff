import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Template } from '../models/template-models';

export class TemplateRegistry {
	public templates: Template[] = [];

	constructor(private searchPaths: string[]) { }

	async loadTemplates(): Promise<void> {
		for (const searchPath of this.searchPaths) {
			const entries = await fs.readdir(searchPath, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isDirectory()) {
					const templateDir = path.join(searchPath, entry.name);
					const template = new Template(templateDir);
					await template.load();
					this.templates.push(template);
				}
			}
		}
	}
}

