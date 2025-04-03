import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { loadAllTemplateConfigs } from '../loaders/template-config-loader';
import { TemplateGeneratorService } from '../services/template-generator-service';
import {
	TemplateConfigModule,
	UserTemplateSettings
} from '@timonteutelink/template-types-lib';

export class Template {
	// The directory that contains the templateConfig.ts file.
	public dir: string;
	// The loaded configuration module.
	public config: TemplateConfigModule<UserTemplateSettings>;
	// The adjacent "templates" directory containing the files to be templated.
	public templatesDir: string;
	// Subtemplates, keyed by the immediate subdirectory name (each key holds an array of children).
	public subTemplates: Record<string, Template[]> = {};
	// A reference to the parent template, if this is a subtemplate.
	public parentTemplate?: Template;
	// If this template was reffed, store the dir containing the templateRef.json.
	public refDir?: string;

	private constructor(
		dir: string,
		config: TemplateConfigModule<UserTemplateSettings>,
		templatesDir: string
	) {
		this.dir = dir;
		this.config = config;
		this.templatesDir = templatesDir;
	}

	/**
	 * Loads all template configurations under the given root directory using loadAllTemplateConfigs.
	 * A Template instance is created for every config file that has an adjacent "templates" folder.
	 * Parent–child relationships are inferred either by a templateRef.json reference
	 * or by checking for nested directories.
	 *
	 * For example, if a template is located at:
	 *   <parent-dir>/project-types/<sub-template-dir>
	 * then the key will be 'project-types'.
	 *
	 * @param rootDir The root directory containing all template configurations.
	 * @returns A single top-level Template instance.
	 */
	public static async createAllTemplates(rootDir: string): Promise<Template> {
		const configs = await loadAllTemplateConfigs(rootDir);
		console.log(configs);
		const templatesMap: Record<string, Template> = {};

		// Create Template instances only for directories with an adjacent "templates" folder.
		for (const info of Object.values(configs)) {
			const templateDir = path.dirname(path.resolve(rootDir, info.configPath));
			const templatesDir = path.join(templateDir, 'templates');
			try {
				const stat = await fs.stat(templatesDir);
				if (!stat.isDirectory()) continue;
			} catch {
				continue;
			}
			const template = new Template(templateDir, info.templateConfig, templatesDir);
			if (info.refDir) {
				// Store the refDir as provided (it will be a relative path, e.g. "github-actions")
				template.refDir = info.refDir;
			}
			templatesMap[templateDir] = template;
		}

		const allTemplates = Object.values(templatesMap);

		// First pass: Handle explicit parent–child links via templateRef.json.
		// For each candidate with a refDir, we resolve it relative to the rootDir.
		// Then, we use path.dirname(refAbsolute) as the intended parent's directory,
		// and use the basename (e.g. "github-actions") as the key.
		for (const candidate of allTemplates) {
			if (candidate.refDir) {
				const refAbsolute = path.resolve(rootDir, candidate.refDir);
				const intendedParentDir = path.dirname(refAbsolute);
				const parent = templatesMap[intendedParentDir];
				if (parent) {
					candidate.parentTemplate = parent;
					const key = path.basename(refAbsolute);
					if (!parent.subTemplates[key]) {
						parent.subTemplates[key] = [];
					}
					parent.subTemplates[key].push(candidate);
				}
			}
		}

		// Second pass: Infer parent–child relationships by directory containment.
		for (const candidate of allTemplates) {
			if (candidate.parentTemplate) continue;

			let immediateParent: Template | null = null;
			let longestMatchLength = 0;

			for (const potentialParent of allTemplates) {
				if (potentialParent === candidate) continue;
				const relative = path.relative(potentialParent.dir, candidate.dir);
				if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) continue;
				const segments = relative.split(path.sep).filter(Boolean);
				if (segments[0] === 'templates') continue;
				if (potentialParent.dir.length > longestMatchLength) {
					immediateParent = potentialParent;
					longestMatchLength = potentialParent.dir.length;
				}
			}

			if (immediateParent) {
				const relPath = path.relative(immediateParent.dir, candidate.dir);
				const key = relPath.split(path.sep)[0];
				if (!key) continue;
				if (!immediateParent.subTemplates[key]) {
					immediateParent.subTemplates[key] = [];
				}
				immediateParent.subTemplates[key].push(candidate);
				candidate.parentTemplate = immediateParent;
			}
		}

		// Determine the root template(s).
		const rootTemplates = allTemplates.filter(template => !template.parentTemplate);
		if (rootTemplates.length === 0) {
			throw new Error('No root templates found');
		}

		if (rootTemplates.length > 1) {
			console.log(rootTemplates);
			throw new Error(
				'Multiple root templates found. Make sure the directory structure is correct.'
			);
		}

		return rootTemplates[0]!;
	}

	/**
	 * Instantiates the template using the TemplateGeneratorService.
	 *
	 * @param userSettings The settings provided by the user.
	 * @param rootDestinationDir The directory where the generated files should be written.
	 */
	public async instantiate(userSettings: UserTemplateSettings, rootDestinationDir: string): Promise<void> {
		const generatorService = new TemplateGeneratorService(this, userSettings, rootDestinationDir);
		const resultPath = await generatorService.instantiateTemplate(this.config.templateConfig.name);
		console.log(`Templated files at: ${resultPath}`);
	}
}

