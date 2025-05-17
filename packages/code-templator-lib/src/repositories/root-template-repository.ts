import * as fs from "node:fs/promises";
import { Template } from "../models/template";
import { Result } from "../lib/types";
import path from "node:path";
import { cloneRevisionToCache } from "../services/git-service";
import { logger } from "../lib/logger";
import { logError } from "../lib/utils";
import { getConfig } from "../lib/env";

// TODO: findTemplate and loadRevision should only load that specific template not load all templates

// now only stores the root templates at: <templateDirPath>/root-templates/*
// later also store reference to files and generic templates to allow direct instantiation without saving state of subtemplates
export class RootTemplateRepository {
	private loading: boolean = false;
	private templatePaths: string[] = [];
	public templates: Template[] = [];

	constructor(templatePaths: string[]) {
		this.templatePaths = templatePaths;
	}

	// default templates are the template dirs defined by user. User decides which revision to use.
	private async loadDefaultTemplates(): Promise<Result<void>> {
		if (this.loading) {
			return { error: "Templates are already loading" };
		}
		this.loading = true;
		this.templates = [];
		for (const templatePath of this.templatePaths) {
			const rootTemplateDirsPath = path.join(templatePath, "root-templates");
			let rootTemplateDirs: string[] = [];
			try {
				rootTemplateDirs = await fs.readdir(rootTemplateDirsPath);
			} catch (error) {
				logger.warn({ error },
					`Failed to read root template directories at ${rootTemplateDirsPath}.`
				);
				continue;
			}
			for (const rootTemplateDir of rootTemplateDirs) {
				const rootTemplateDirPath = path.join(
					rootTemplateDirsPath,
					rootTemplateDir,
				);
				try {
					const stat = await fs.stat(rootTemplateDirPath);
					if (!stat.isDirectory()) {
						logger.warn(
							`Root template directory at ${rootTemplateDirPath} is not a directory`,
						);
						continue;
					}
				} catch (e) {
					logger.warn(
						`Failed to read root template directory at ${rootTemplateDirPath}: ${e}`,
					);
					continue;
				}

				const template = await Template.createAllTemplates(rootTemplateDirPath);
				if ("error" in template) {
					continue;
				}
				this.templates.push(template.data);
			}
		}

		this.loading = false;

		return { data: undefined };
	}

	async reloadTemplates(): Promise<Result<void>> {
		return await this.loadDefaultTemplates();
	}

	async getAllTemplates(): Promise<Result<Template[]>> {
		if (!this.templates.length) {
			const result = await this.loadDefaultTemplates();
			if ("error" in result) {
				return result;
			}
			if (!this.templates.length) {
				logError({ shortMessage: "No templates found." })
				return { error: "No templates found." };
			}
		}
		return { data: this.templates };
	}

	async findDefaultTemplate(templateName: string): Promise<Result<Template | null>> {
		if (!this.templates.length) {
			const result = await this.loadDefaultTemplates();
			if ("error" in result) {
				return result;
			}
			if (!this.templates.length) {
				logError({ shortMessage: "No templates found." })
				return { error: "No templates found." };
			}
		}

		for (const template of this.templates) {
			if (template.config.templateConfig.name === templateName && template.isDefault) {
				return { data: template };
			}
		}
		return { data: null };
	}

	async findAllTemplateRevisions(templateName: string): Promise<Result<Template[] | null>> {
		const template = await this.getAllTemplates();

		if ("error" in template) {
			return template;
		}

		const revisions = template.data.filter((template) => {
			return template.config.templateConfig.name === templateName;
		});

		if (revisions.length === 0) {
			logger.warn(`No revisions found for template ${templateName}`);
			return { data: null };
		}

		return { data: revisions };
	}

	async loadRevision(templateName: string, revisionHash: string): Promise<Result<Template | null>> {
		const result = await this.findAllTemplateRevisions(templateName);
		if ("error" in result) {
			return result;
		}
		const revisions = result.data;
		if (!revisions || revisions.length === 0) {
			return { data: null };
		}

		let defaultTemplate: Template | undefined;
		for (const revision of revisions) {
			if (revision.commitHash === revisionHash) {
				return { data: revision };
			}
			if (revision.isDefault) {
				defaultTemplate = revision;
			}
		}

		if (!defaultTemplate) {
			logError({ shortMessage: `No default template found for ${templateName}` })
			return { data: null };
		}

		const saveRevisionInCacheResult = await cloneRevisionToCache(defaultTemplate, revisionHash);

		if ("error" in saveRevisionInCacheResult) {
			return saveRevisionInCacheResult;
		}

		const newTemplatePath = path.join(saveRevisionInCacheResult.data, "root-templates", path.basename(defaultTemplate.absoluteDir));

		const newTemplate = await Template.createAllTemplates(newTemplatePath);

		if ("error" in newTemplate) {
			return newTemplate
		}

		this.templates.push(newTemplate.data);

		return { data: newTemplate.data };
	}
}

