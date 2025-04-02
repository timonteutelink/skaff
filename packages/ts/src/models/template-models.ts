import { TemplateConfigModule, UserTemplateSettings } from '@timonteutelink/template-types-lib';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { loadTemplateConfig } from '../loaders/template-config-loader';
import { TemplateGeneratorService } from '../services/template-generator-service';

async function isTemplateDir(dir: string): Promise<boolean> {
	try {
		const stat = await fs.stat(dir);
		return stat.isDirectory() && await fs.readdir(dir).then(entries => entries.includes('templateConfig.ts'))
	} catch {
		return false;
	}
}

export type SubTemplatesMap = Record<string, Record<string, Template>>;

export class Template {
	public path: string;
	public templateConfigModule: TemplateConfigModule<UserTemplateSettings>;
	public templatesDirPath: string;
	public subTemplates: Record<string, Record<string, Template>> = {};

	public parentTemplate: Template | null = null;

	private constructor(templateDir: string, templateConfigModule: TemplateConfigModule<UserTemplateSettings>, templatesDirPath: string, subTemplates: SubTemplatesMap) {
		this.path = templateDir;
		this.templateConfigModule = templateConfigModule;
		this.templatesDirPath = templatesDirPath;
		this.subTemplates = subTemplates;
	}

	public static async create(templateDir: string): Promise<Template> {
		const stat = await fs.stat(templateDir);
		if (!stat.isDirectory()) {
			throw new Error(`Template directory not found: ${templateDir}`);
		}
		const templateConfigModule = await Template.loadTemplateConfig(templateDir);
		const templatesDirPath = await Template.findTemplatesDir(templateDir);
		const subTemplates: Record<string, Record<string, Template>> = await Template.loadSubTemplates(templatesDirPath);
		const finalTemplate = new Template(templateDir, templateConfigModule, templatesDirPath, subTemplates);
		Object.values(subTemplates).forEach((moreSubTemplates) => Object.values(moreSubTemplates).forEach((subTemplate) => subTemplate.parentTemplate = finalTemplate));
		return finalTemplate;
	}

	private static async loadTemplateConfig(templateDir: string): Promise<TemplateConfigModule<UserTemplateSettings>> {
		return await loadTemplateConfig(templateDir);
	}

	private static async findTemplatesDir(templateDir: string): Promise<string> {
		const templatesDir = path.join(templateDir, 'templates');
		try {
			const stat = await fs.stat(templatesDir);
			if (stat.isDirectory()) {
				return templatesDir;
			}
		} catch {
			throw new Error(`No 'templates' directory found in ${templateDir}`);
		}
		throw new Error('No templates directory found');
	}

	private static async loadSubTemplates(templatesDirPath: string): Promise<SubTemplatesMap> {
		const subTemplates: SubTemplatesMap = {};
		const entries = await fs.readdir(templatesDirPath, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isDirectory() && !entry.name.endsWith('templates') && !entry.name.includes('node_modules')) {
				const subTemplatesDir = path.join(templatesDirPath, entry.name);
				const subTemplateDirEntries = await fs.readdir(subTemplatesDir, { withFileTypes: true });
				for (const subEntry of subTemplateDirEntries) {
					const subTemplateDir = path.join(subTemplatesDir, subEntry.name);

					if (!await isTemplateDir(subTemplateDir)) {
						continue;
					}

					const subTemplate = await Template.create(subTemplateDir);
					const entryName = entry.name;

					if (!subTemplates[entryName]) {
						subTemplates[entryName] = {};
					}

					subTemplates[entryName][subEntry.name] = subTemplate;
				}
			}
		}
		return subTemplates;
	}

	public async instantiate(userSettings: UserTemplateSettings, rootDestinationDir: string): Promise<void> {
		const generatorService = new TemplateGeneratorService(this, userSettings, rootDestinationDir);
		const resultPath = generatorService.instantiateTemplate(this.templateConfigModule.templateConfig.name);
		console.log(`Templated files at: ${resultPath}`)
	}
}
